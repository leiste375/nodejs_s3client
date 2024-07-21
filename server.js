const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
const { S3Client, GetObjectCommand, PutObjectCommand, paginateListObjectsV2, DeleteObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { Upload } = require("@aws-sdk/lib-storage");
const {v4: uuidv4 } = require('uuid');
const clients = {} //Store sessionIds
const app = express();
require('dotenv').config();

//Custom http requestHandler for S3 API calls.
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const LdapAuthenticator = require('./ldap');
const httpHandler = new NodeHttpHandler({
});

//Configure webserver
const PORT = process.env.PORT || 3000;
const HTTPS_ENABLED = process.env.HTTPS_ENABLED || false;
if (HTTPS_ENABLED === 'false') {
    http = require('http');
    //Disable SSL for all S3 API calls for testing purposes. Set via NODE_TLS_REJECT_UNAUTHORIZED in .env
    httpHandler.sslAgent = new http.Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    });
} else {
    https = require('https');
    httpHandler.sslAgent = new https.Agent({
        rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
    });
}

//Setup for express app below
//Handle CORS & enable request from OpenSpecimen Server for cross-site requests.
const cors = require('cors');
const corsOption = {
    origin: process.env.ALLOWED_CROSS_SITE_ORIGINS,
    optionsSuccessStatus: 200,
    credentials: true,
    allowedHeaders: [ 'Content-Type','Access-Control-Allow-Credentials', 'Authorization' ]
};
app.use(cors(corsOption));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '/public')));
app.use(express.json());

// Use sessions to track logged-in users
app.use(cookieParser());
if (process.env.HTTPS_PROXY === true && process.env.HTTPS_ENABLED === 'false') {
    console.log('Server requires Proxy to work');
    app.set('trust proxy', 1);
}
app.use(session({
    genid: (req) => { return uuidv4(); },
    secret: process.env.COOKIE_SECRET_HASH,
    resave: false,
    //credentials: true,
    //Allow partitioned cookies for external pages.
    partitioned: true,
    saveUninitialized: true,
    cookie: {
        secure: process.env.HTTPS_PROXY,
        //Set sameSite to None to avoid connect.sid warning & allow cross-site requests.
        sameSite: 'None',
        httpOnly: process.env.HTTPS_PROXY,
    }
}));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
// AWS S3 configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    endpoint: process.env.S3_ENDPOINT,
    requestHandler: httpHandler,
    forcePathStyle: true,
});

//Async function to get list of objects in storage
async function S3ObjectList(client) {
    const objList = [];
    for await (const data of paginateListObjectsV2({ client }, { Bucket: process.env.S3_BUCKET_NAME } )) {
        objList.push(...(data.Contents ?? []));
    }
    const s3Json = { Contents: objList };
    const jsonData = JSON.stringify(s3Json, null, 4);
    fs.writeFile(path.join(__dirname, '/downloads/s3ObjectList.json'), jsonData, 'utf-8', function(e) {
        if (e) {
            console.log(e);
        }
    });
    return jsonData;
};

//Create a directory structure out of a S3 object list.
function S3DirStructure(s3ObjList) {
    const finalJson = {};
    s3ObjList.forEach(s3Entry => {
        //Split Key string and loop through resulting list.
        var path = s3Entry.Key.split("/").filter(part => part !== '');
        let runningJson = finalJson;
        //Handle object keys starting with a slash
        if (s3Entry.Key.startsWith('/')) {
            path[0] = `/${path[0]}`;
        }
        path.forEach((part, index) => {
            //Assign entry to last part of the path or create new array if applicable. 
            if (index === path.length - 1) {
                runningJson[part] = s3Entry;
            } else if (!runningJson[part]) {
                runningJson[part] = {};
            }
            runningJson = runningJson[part];
        });
    });
    jsonData = JSON.stringify(finalJson, null, 4);
    fs.writeFile(path.join(__dirname, '/downloads/s3DirStructure.json'), jsonData, 'utf-8', function(e) {
        if (e) {
            console.log(e);
        }
    });
    return finalJson;
};

function handleDir(dirKey) {
    if (!dirKey.endsWith('/')) {
        dirKey +='/';
    }
    if (dirKey.startsWith('/')) {
        dirKey = dirKey.slice(1);
    }
    return dirKey
};

//Simple function to check if users are logged in.
function handleLogin(req, res, next) {
    if (!req.session.user) {
        req.session.returnTo = req.originalUrl;
        return res.redirect('/login');
    }
    next();
}

//Serve main page.
app.get('/', handleLogin, (req, res) => {
  if (!req.session.user) {
    return res.redirect('/login');
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, '/public/login.html'));
});
// Endpoint to authenticate a user
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const AllowedUsers = process.env.S3_USERS;

    //Ensure that form isn't empty and that users are authorized. Array of users is currently defined via .env file.
    if (!username || !password) {
        return res.status(400).send('Username and password are required');
    } else if (!AllowedUsers.includes(username)) {
        return res.status(400).send('User not authorized.');
    }

    const url = process.env.LDAP_URL;
    const baseDN = process.env.LDAP_BASE_DN;

    LdapAuthenticator(url, baseDN, username, password)
        .then((authResult) => {
            if (authResult) {
                req.session.user = username;
                const returnTo = req.session.returnTo || '/';
                delete req.session.returnTo;
                res.status(200).redirect(returnTo);
            } else {
                console.log('Authentication failed: ', e);
                res.status(401).send('Authentication failed');
            }
        })
        //ldapjs always sends error upon unsuccesful authentication against tested server.
        .catch((e) => {
            console.log(e);
            res.status(400).send(`Please try again. Authentication failed: ${e}. Note that only "o_username" is currently supported for login.`);
        });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

//Stream progress updates back to client
app.get('/progress', (req, res) => {
    const sessionId = req.sessionID;
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    //Create new array if it doesn't exist
    if (!clients[sessionId]) {
        clients[sessionId] = [];
    }
    clients[sessionId].push(res);

    //Close connection & remove uuid from array
    req.on('close', () => {
        clients[sessionId] = clients[sessionId].filter(client => client !== res);
        if (clients[sessionId].length === 0) {
            delete clients[sessionId];
        }
    });
});
const sendProgress = (sessionId, progress) => {
    if (clients[sessionId]) {
        const jsonProgress = JSON.stringify({ loaded: progress.loaded, total: progress.total})
        clients[sessionId].forEach(client => client.write(`data: ${jsonProgress}\n\n`));
    }
}

//TODO: Implement @aws/xhr-http-handeler for smoother progress tracking.
app.post('/upload', handleLogin, upload.single('file'), async (req, res) => {
    try {
        const sessionId = req.sessionID;
        if (!sessionId) {
            res.status(500).send('Error processing session ID.');
        } else {
        }

        let filedir = String(req.body.filedir);
        filedir = handleDir(filedir);
        const filename = req.file.originalname;
        const s3_key = filedir.concat(filename);

        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3_key,
            Body: req.file.buffer,
        };
        //const command = new PutObjectCommand(params);
        //await s3Client.send(command);
        const parallelUploads = new Upload({
            client: s3Client,
            params: params,
            queueSize: 4,
            partSize: 1024 * 1024 * 5,
            leavePartsOnError: false,
        });
        parallelUploads.on('httpsUploadProgres', (progress) => {
            sendProgress(sessionId, progress);
        })

        await parallelUploads.done();
        res.status(200).send('File uploaded successfully!');
    } catch (e) {
        res.status(500).send(e.message);
    }
});

//Use express.text() to handle MIME type 'text/plain'
app.use('/createdir', express.text());
app.post('/createdir', handleLogin, async(req, res) => {
    try {
        let newdir = req.body;
        newdir = handleDir(newdir);

        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: newdir,
        };
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        res.send('Directory created succesfully!');
    } catch (e) {
        console.log(e);
        res.status(500).send(e.message);
    }
});

app.get('/download', handleLogin, async (req, res) => {
    try {
        const filename = req.query.filename;
        if (!filename) {
            return res.status(400).send('Filename is required');
        }
        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: filename,
        };
        const command = new GetObjectCommand(params);
        const data = await s3Client.send(command);

        res.setHeader('Content-Disposition', `attachment; filename="${filename.split('/').slice(-1)}"`);
        res.setHeader('Content-Type', data.ContentType);
        data.Body.pipe(res);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

//Handle deletion of single and multiple objects. Expects an array.
app.post('/delete', handleLogin, async (req, res) => {
    try {
        const array = req.body.array;
        if (!array) {
            return res.status(400).send('File for deletion is required');
        }
        if (array.length === 1) {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: array[0].Key,
            }
            const command = new DeleteObjectCommand(params);
            await s3Client.send(command);
        } else {
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Delete: {
                    Objects: array,
                }
            }
            const command = new DeleteObjectsCommand(params);
            await s3Client.send(command)
        }
        return res.status(200).send('OK');
    } catch (e) {
        console.log(e);
        res.status(500).send(e);
    }
});

//Endpoint to serve a JSON of all available objects in storage. The first endpoint serves a previously downloaded JSON,
//whereas the second endpoint will update the list. 
app.get('/filepicker1', handleLogin, async (req, res) => {
    const S3ListPath = path.join(__dirname, '/downloads/s3DirStructure.json');
    if (!fs.existsSync(S3ListPath)) {
        fs.writeFileSync(S3ListPath, '{}', { flag: 'w+' });
    }
    try {
        fs.readFile(S3ListPath, 'utf-8', (e, s3List) => {
            if (e) {
                console.error('Error while reading file:',e);
                return res.status(500).send(e.message);
            }
            res.json(JSON.parse(s3List));
        });
    } catch (e) {
        res.status(500).send('Error while parsing json:',e);
    }
});
app.get('/filepicker2', handleLogin, async (req, res) => {
    try {
        currentS3List = await S3ObjectList(s3Client);
        const jsonDataNew = JSON.parse(currentS3List);
        const jsonFilteredNew = jsonDataNew.Contents.map(item => ({ Key: item.Key, Size: item.Size }));
        const finalListNew = S3DirStructure(jsonFilteredNew);
        res.json(finalListNew);
    } catch(e) {
        console.error('Error while updating list:',e)
    }
});

if (HTTPS_ENABLED === 'false') {
    http.createServer(app).listen(PORT, () => {
        console.log(`HTTP Server is running on port ${PORT}`)
    });
} else {
    const httpsOptions = {
      key: fs.readFileSync(process.env.HTTPS_KEY),
      cert: fs.readFileSync(process.env.HTTPS_CERT)
    };
    https.createServer(httpsOptions, app).listen(PORT, () => {
        console.log(`HTTPS Server is running on port ${PORT}`);
    });
}
