const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const session = require('express-session');
//const htmlParser = require('node-html-parser').parse;
const { S3Client, GetObjectCommand, PutObjectCommand, paginateListObjectsV2 } = require('@aws-sdk/client-s3');
const app = express();
const PORT = process.env.PORT || 3000;
require('dotenv').config();

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
//app.use(express.static(path.join(__dirname, '/public/login.html')));
app.use(express.static(path.join(__dirname, '/public')));
// Use sessions to track logged-in users
app.use(cookieParser());
app.use(session({
    secret: process.env.COOKIE_SECRET_HASH,
    resave: false,
    credentials: true,
    //Allow partitioned cookies for external pages.
    partitioned: true,
    saveUninitialized: true,
    cookie: {
        secure: true,
        //Set sameSite to None to avoid connect.sid warning observed in Firefox. Maybe Chromium?
        sameSite: 'None',
        httpOnly: true,
    }
}));

//Custom http requestHandler for S3 API calls.
const { NodeHttpHandler } = require('@smithy/node-http-handler');
const LdapAuthenticator = require('./ldap');
const httpHandler = new NodeHttpHandler({
});

//Disable SSL for all S3 API calls for testing purposes. Set via NODE_TLS_REJECT_UNAUTHORIZED in .env
httpHandler.sslAgent = new https.Agent({
    rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
});

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
    for await (const data of paginateListObjectsV2({ client }, { Bucket: "mug-openspecimen" } )) {
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
    const AllowedUsers = process.env.S3_USERS.split(",");

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
            /*} else {
                console.log("Authentication failed: ", e);
                res.status(401).send('Authentication failed');*/
            }
        })
        //ldapjs always sends error upon unsuccesful authentication.
        .catch((e) => {
            res.status(400).send(`Please try again. Authentication failed: ${e}. Note that only "o_username" is currently supported for login.`);
        });
});

app.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/login');
});

app.post('/upload', handleLogin, upload.single('file'), async (req, res) => {
    try {
        let filedir = String(req.body.filedir);
        const filename = req.file.originalname;

        if (!filedir.endsWith('/')) {
            filedir +='/';
        }
        if (filedir.startsWith('/')) {
            filedir = filedir.slice(1);
        }

        const s3_key = filedir.concat(filename);
        const params = {
            Bucket: process.env.S3_BUCKET_NAME,
            Key: s3_key,
            Body: req.file.buffer,
        };
        const command = new PutObjectCommand(params);
        await s3Client.send(command);
        res.send('File uploaded successfully!');
    } catch (e) {
        console.log(e)
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

        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', data.ContentType);
        data.Body.pipe(res);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

//Endpoint to serve a JSON of all available objects in storage. The first endpoint serves a previously downloaded JSON,
//whereas the second endpoint will update the list. 
app.get('/filepicker1', handleLogin, async (req, res) => {
    const S3ListPath = path.join(__dirname, "/downloads/s3ObjectList.json");
    fs.readFile(S3ListPath, (e, data) => {
        if (e) {
            console.error('Error while reading file:',e);
            return res.status(500).send(e.message);
        }
        try {
            const jsonData = JSON.parse(data);
            const jsonFiltered = jsonData.Contents.map(item => ({ Key: item.Key, Size: item.Size }));
            res.json(jsonFiltered);
        } catch (e) {
            console.error('Error while parsing json:',e);
        }
    })
});
app.get('/filepicker2', handleLogin, async (req, res) => {
    try {
        currentS3List = await S3ObjectList(s3Client);
        //console.log(currentS3List);
        const jsonDataNew = JSON.parse(currentS3List);
        const jsonFilteredNew = jsonDataNew.Contents.map(item => ({ Key: item.Key, Size: item.Size }));
        res.json(jsonFilteredNew);
    } catch(e) {
        console.error('Error while updating list:',e)
    }
})

const httpsOptions = {
  key: fs.readFileSync(process.env.HTTPS_KEY),
  cert: fs.readFileSync(process.env.HTTPS_CERT)
};

https.createServer(httpsOptions, app).listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
