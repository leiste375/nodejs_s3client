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
const archiver = require('archiver');
const stream = require('stream');
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
app.disable('x-powered-by');

// Use sessions to track logged-in users
app.use(cookieParser());
var sess = {
    genid: (req) => { return uuidv4(); },
    secret: process.env.COOKIE_SECRET_HASH,
    resave: false,
    //credentials: true,
    //Allow partitioned cookies for external pages.
    partitioned: true,
    saveUninitialized: true,
    cookie: {
        secure: false,
        //Set sameSite to None to avoid connect.sid warning & allow cross-site requests.
        sameSite: 'None',
        httpOnly: true,
    }
}
if (process.env.HTTPS_PROXY === 'true' && process.env.HTTPS_ENABLED === 'false') {
    console.log('Server requires Proxy to work');
    app.set('trust proxy', 1)
    sess.cookie.secure = true
};
app.use(session(sess))

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

/*
//Async function to get list of objects in storage
async function s3Sync(client) {
    const s3ObjectList = path.join(__dirname, '/downloads/s3ObjectList.json');
    const oldList = JSON.parse(fs.readFileSync(s3ObjectList, 'utf8'));
    const newList = [];
    let i = 0;
    for await (const data of paginateListObjectsV2({ client }, { Bucket: process.env.S3_BUCKET_NAME } )) {
        console.log(oldList.length);
        if (oldList.length == 0 || oldList.length == undefined) {
            newList.push(...(data.Contents ?? []));
            continue;
        }
        runningList = data.Contents ?? [];
        for (entry in runningList) {
            if (runningList[entry].Key === oldList[i].Key) {
                console.log(runningList[entry].Key);
            };
            i++;
        };
    }
    const jsonFiltered = newList.map(item => ({ Key: item.Key, Size: item.Size, LastModified: item.LastModified }));
    const s3Objects = JSON.stringify(jsonFiltered, null, 4);
    fs.writeFile(path.join(__dirname, '/downloads/s3ObjectList.json'), s3Objects, 'utf-8', function(e) {
        if (e) {
            console.log(e);
        }
    });
    
    return jsonFiltered;
};

//Create a directory structure out of a S3 object list.
function S3DirStructure(s3ObjList) {
    const finalJson = {};
    s3ObjList.forEach(s3Entry => {
        //Split Key string and loop through resulting list.
        const path = s3Entry.Key.split("/").filter(part => part !== '');
        let runningJson = finalJson;
        //Handle object keys starting with a slash
        if (s3Entry.Key.startsWith('/')) {
            path[0] = `/${path[0]}`;
        }
        path.forEach((part, index) => {
            //console.log(part);
            //Assign entry to last part of the path or create new array if applicable. 
            if (index === path.length - 1) {
                //console.log(s3Entry);
                runningJson[part] = s3Entry;
            } else if (!runningJson[part]) {
                runningJson[part] = {};
            }
            runningJson = runningJson[part];
        });
    });
    const jsonData = JSON.stringify(finalJson, null, 4);
    fs.writeFile(path.join(__dirname, '/downloads/s3DirStructure.json'), jsonData, 'utf-8', function(e) {
        if (e) {
            console.log(e);
        }
    });
    return finalJson;
};
*/

//Async function to get list of objects in storage
async function s3Sync(client) {
    const objList = [];
    for await (const data of paginateListObjectsV2({ client }, { Bucket: process.env.S3_BUCKET_NAME } )) {
        objList.push(...(data.Contents ?? []));
    }
    const jsonFiltered = objList.map(item => ({ Key: item.Key, Size: item.Size, LastModified: item.LastModified }));
    const s3Objects = JSON.stringify(jsonFiltered, null, 4);
    fs.writeFile(path.join(__dirname, '/downloads/s3ObjectList.json'), s3Objects, 'utf-8', function(e) {
        if (e) {
            console.log(e);
        }
    });
    return jsonFiltered;
};

//Create a directory structure out of a S3 object list.
function S3DirStructure(s3ObjList) {
    const finalJson = {};
    s3ObjList.forEach(s3Entry => {
        //Split Key string and loop through resulting list.
        const path = s3Entry.Key.split("/").filter(part => part !== '');
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
    const jsonData = JSON.stringify(finalJson, null, 4);
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
        res.setHeader('Content-Disposition', `attachment; filename="${filename.split('/').slice(-1)[0]}"`);
        res.setHeader('Content-Type', data.ContentType ?? 'application/octet-stream');
        res.setHeader('Content-Length', data.ContentLength);

        data.Body.pipe(res);
    } catch (e) {
        console.log(e);
        res.status(500).send(e.message);
    }
});
app.post('/multidownload', handleLogin, async (req, res) => {
    try {
        const array = req.body.array ? JSON.parse(req.body.array) : null;
        if (!array) {
            return res.status(400).send('Files for download required');
        }
        res.setHeader('Content-Disposition', 'attachment; filename="files.zip"');
        res.setHeader('Content-Type', 'application/zip');
        //res.setHeader('Transfer-Encoding', 'chunked');
        //res.flushHeaders();

        const archive = archiver('zip', {zlib: {level: 9 } });
        archive.pipe(res);

        async function file(key) {
            let s3Key = key.Key;
            let s3Name = s3Key.endsWith('/') ? s3Key.split('/').slice(-2)[0] : s3Key.split('/').slice(-1)[0];
            const params = {
                Bucket: process.env.S3_BUCKET_NAME,
                Key: s3Key,
            };
            const command = new GetObjectCommand(params);
            const data = await s3Client.send(command);
            archive.append(data.Body, { name: s3Name });

        };

        await Promise.all(array.map(file));
        await archive.finalize();
    } catch (e) {
        console.log(e);
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
        return res.status(200).send('Deletion succesful!');
    } catch (e) {
        console.log(e);
        res.status(500).send(e);
    }
});

//Endpoint to serve a JSON of all available objects in storage. The first endpoint serves a previously downloaded JSON,
//whereas the second endpoint will update the list. 
app.get('/filepicker1', handleLogin, async (req, res) => {
    try {
        const downloadDir = path.join(__dirname, 'downloads');
        if (!fs.existsSync(downloadDir)) {
            fs.mkdirSync(downloadDir, { recursive: true });
        }
        const s3DirStruct = path.join(__dirname, '/downloads/s3DirStructure.json');
        const s3ObjectList = path.join(__dirname, '/downloads/s3ObjectList.json');
        if (!fs.existsSync(s3DirStruct)) {
            fs.writeFileSync(s3DirStruct, '{}', { flag: 'w+' });
        }
        if (!fs.existsSync(s3ObjectList)) {
            fs.writeFileSync(s3ObjectList, '{}', { flag: 'w+' });
        }
        const [s3DirData, s3ListData] = await Promise.all([
            fs.promises.readFile(s3DirStruct, 'utf-8'),
            fs.promises.readFile(s3ObjectList, 'utf-8')
        ]);
        const s3DirJson = JSON.parse(s3DirData);
        const s3ListJson = JSON.parse(s3ListData);

        res.status(200).json({ s3Dir: s3DirJson, s3List: s3ListJson });
    } catch (e) {
        res.status(500).json({ error: `Error while parsing files: ${e}`});
    }
});
app.get('/filepicker2', handleLogin, async (req, res) => {
    try {
        const time1 = performance.now();
        let syncedS3Objects = await s3Sync(s3Client);
        //Clone object to avoid it being overwritten
        const s3ObjectsClone = JSON.parse(JSON.stringify(syncedS3Objects));
        const s3Dir = S3DirStructure(syncedS3Objects);
        const time2 = performance.now();
        console.log(`Old function took ${time2 - time1} ms to execute.`)
        res.status(200).json({ s3Dir: s3Dir, s3List: s3ObjectsClone });
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
