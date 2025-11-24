const express = require("express");
const path = require('path');
const multer = require('multer');
const router = express.Router();
const { connectDB, getDB, uploadFile, getBucket} = require('./db');
const fetch = require('node-fetch').default;
const flash = require('connect-flash');
const fs = require('fs');
const { ObjectId, GridFSBucket } = require("mongodb");



function parseObjectId(id) {
    if (!id) return null;
    if (!ObjectId.isValid(id)) return null;
    try {
        return new ObjectId(id);
    } catch (err) {
        return null;
    }
}

router.use(express.json());
router.use(express.urlencoded({ extended: true }));
router.use(express.static(path.join(__dirname, 'public')));

const uploadDir = path.join(__dirname, 'uploads');

router.use(flash());

if (fs.existsSync(uploadDir)) {
    FileArray = fs.readdirSync(uploadDir).map(filename => ({
        originalname: filename,
        filename: filename

    }))
}

connectDB().then(() => {
    db = getDB();
    bucket = getBucket();

});


//configure storage engine and filename
const fileStorage = multer.diskStorage({
    destination: './uploads/',
    filename: function (req, file, cb) {
        cb(null, path.parse(file.originalname).name + path.extname(file.originalname));
    }
});

const upload = multer({
    fileStorage: fileStorage,
    limits: { fileSize: 1000000 }
}).single("myFile");


// For parsing multipart form fields (used by the edit form which posts FormData)
const parseForm = multer().none();


// Show upload page
router.get('/upload', async (req, res) => {
    try {
        const bucket = getBucket();
        const db = getDB();

        if (!req.session.user || !req.session.user._id) {
            return res.status(401).send('Unauthorized: Session required for upload.');
        }

        const userID = req.session.user._id;
        const files = await bucket.find({ 'metadata.userId': userID }).toArray();
        const folders = await db.collection('folders').find({userId:userID}).toArray();
        res.render("upload", { fileArray: files, folderArray: folders });
    } catch (err) {
        console.error(err);
        res.status(500).send('Could not fetch files');
    }
});

//upload markdown files
router.post('/upload', upload, async (req, res) => {

    const filepath = req.file ? req.file.path : null;

    try {

        if (!filepath) {
            return res.status(400).send('No file was received for upload.');
        }

        if (!req.session.user || !req.session.user._id) {

            return res.status(401).send('Unauthorized: Session required for upload.');
        }

        const userId = req.session.user._id;
        const folderId = null;

        const existingFile = await bucket.find({
            'metadata.userId': userId,
            filename: req.file.originalname
        }).limit(1).toArray();

        if (existingFile.length > 0) {
            console.log("File already uploaded by this user:", req.file.originalname);
            return res.status(409).send('File with this name already uploaded.');
        }

        const fileId = await uploadFile(filepath, userId);
        const allFiles = await bucket.find({ userId: userId }).toArray();
        res.redirect('/notes/upload');
        console.log("File uploaded with id:", fileId.toString());

    } catch (err) {
        console.error(err);
        res.status(500).send('File upload failed');
    } finally {
        if (filepath) {
            try {
                fs.unlinkSync(filepath);
            } catch (cleanupErr) {
                console.warn('Failed to delete temporary file:', cleanupErr);
            }
        }
    }
});

//view the note
router.get('/view/:uniqueId', async (req, res) => {
    try {
        const bucket = getBucket();
        const fileId = parseObjectId(req.params.fileId);
        if (!fileId) return res.status(400).send('Invalid file id');
        const downloadStream = bucket.openDownloadStream(fileId);

        let data = '';

        downloadStream.on('data', (chunk) => {
            data += chunk.toString();
        })

        downloadStream.on('end', () => {
            res.render('view', { content: data, fileId: fileId.toString() });
        })

        downloadStream.on('error', (err) => {
            console.error(err);
            res.status(404).send('File not found');
        });
    } catch (err) {
        console.error(err);
        res.status(404).send('File not found');
    }
});

//check grammar function
async function checkGrammar(text) {
    try {
        const response = await fetch("https://api.languagetoolplus.com/v2/check", {
            method: "POST",
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `text=${encodeURIComponent(text)}&language=en-US`
        });
        const result = await response.json();
        return result.matches;
    } catch (err) {
        console.error("Grammar check error:", err);
        return [];
    }
}

//check grammar
router.get('/grammar-check/:uniqueId', async (req, res) => {
    try {
        const bucket = getBucket();
        const uniqueId = req.params.uniqueId;

        if (!uniqueId) return res.status(400).send('Invalid unique id');

        const file = await bucket.find({'metadata.uniqueId': uniqueId}).sort({uploadDate: -1}).limit(1).next();

        if (!file) {
            return res.status(404).send("No file found for this note");
        }
        const fileId = file._id;

        let content = '';
        const downloadStream = bucket.openDownloadStream(fileId);

        downloadStream.on('data', chunk => {
            content += chunk.toString();
        });

        downloadStream.on('end', async () => {
            const mistakes = await checkGrammar(content);
            res.render('grammar', { content, mistakes });
        });

        downloadStream.on('error', err => {
            console.error(err);
            res.status(404).send('File not found');

        });
    } catch (err) {
        console.error(err);
        res.status(500).send('Grammar check failed!');
    }
});

//download notes
router.get('/download/:uniqueId', async (req, res) => {
    try {
        const uniqueId = req.params.uniqueId;
        if (!uniqueId) return res.status(400).send('Invalid unique id');
        const bucket = getBucket();
        const file = await bucket.find({'metadata.uniqueId':uniqueId}).sort({uploadDate: -1}).limit(1).next();
        const fileId = file._id;
        const downloadStream = bucket.openDownloadStream(fileId);

        downloadStream.on('file', (file) => {
            res.set({
                'Content-Type': file.contentType || 'application/octet-stream',
                'Content-Disposition': `attachment; filename="${file.filename}"`
            })
        });

        downloadStream.pipe(res);

    } catch (err) {
        console.error(err);
        res.status(500).send('Download failed!');
    }
})

//edit notes
router.get('/edit/:uniqueId', async (req, res) => {

    try {
        const bucket = getBucket();
        const uniqueId = req.params.uniqueId;
        const file = await bucket.find({'metadata.uniqueId': uniqueId}).sort({uploadDate:-1}).limit(1).next();
        if (!file) return res.status(404).send('File not found');
        const fileId = file._id;
        if (!fileId) return res.status(400).send('Invalid file id');

        const editfilename = file.filename;

        const downloadStream = bucket.openDownloadStream(fileId);
        let data = '';

        downloadStream.on('data', (chunk) => {
            data += chunk.toString();
        });

        downloadStream.on('end', () => {
            res.render('edit', { content: data, fileId: fileId, file: file, filename: editfilename, uniqueId: uniqueId});
        });

        downloadStream.on('error', (err) => {
            console.error(err);
            res.status(404).send('File not found');
        });

    } catch (err) {
        console.error(err);
        res.status(500).send('Edit note failed!');
    }
});

//saving the edited note
router.post('/edit/:uniqueId', async (req, res) => {
    try {
        const bucket = getBucket();
        const { content } = req.body;
        const UniqueId  = req.params.uniqueId;

        if (!content) return res.status(400).send("No content provided");

        const UserId = req.session.user._id;

        //Get old file data
        const oldFile = await bucket.find({ 
        'metadata.uniqueId': UniqueId, 
        'metadata.userId': UserId 
        }).sort({ uploadDate: -1 }).limit(1).next();

        if (!oldFile) return res.status(404).send("Original file not found");
        const oldFileId = oldFile._id;
        const uniqueId = oldFile.metadata.uniqueId;

        // const filename = oldFile.filename;
        const userId = oldFile.metadata.userId;
        const filename = oldFile.filename;

        //Upload new content
        const uploadStream = bucket.openUploadStream( filename,
            {
                metadata: {
                    userId: userId,
                    uniqueId: uniqueId
                }
            });

        await new Promise((resolve, reject) => {
            uploadStream.write(content);
            uploadStream.end();

            uploadStream.on("finish", () => {
                console.log("Uploaded edited file, id:", uploadStream.id);
                resolve();
            });

            uploadStream.on("error", (err) => {
                console.error("Upload failed:", err);
                reject(err);
            });
        });

        try {
            await bucket.delete(oldFile._id);
            console.log("Deleted old file:", oldFile._id.toString());
        } catch (deleteErr) {
            console.warn("Failed to delete old file, but new version exists", deleteErr);
        }
        return res.json({ success: true, message: "Note saved!", newFileId: uploadStream.id });

    } catch (err) {
        console.error("Editing note failed:", err);
        return res.status(500).send("Saving edited note failed!");

    }
});

// Delete note 
router.post('/delete/:uniqueId', async (req, res) => {
    try {

        console.log("Delete route called");
        const fileId = parseObjectId(req.params.fileId);
        const bucket = getBucket();

        const fileDoc = await bucket.find({ _id: fileId });

        if (!fileDoc) {
            console.warn('File to delete not found:', fileId.toString());
            return res.status(404).send('File not found');
        } else {
            console.log('File to delete found:', fileId.toString());
        }

        console.log('Calling bucket.delete for', fileId.toString());
        await new Promise((resolve, reject) => {
            bucket.delete(fileId, (err) => {
                if (err) {
                    console.error('bucket.delete error:', err);
                    reject(err);
                }
                console.log('Deleted file:', fileId.toString());

                resolve('deletion was successful!');


            });
            res.redirect('/notes/upload');
        });

        console.log('Deleting file succeeded:', fileId.toString());
        res.json({ success: true });

    } catch (err) {
        console.error('Delete failed:', err);
        res.status(500).send('Delete failed');
    }
});

//create folder
router.post('/create-folder', async(req, res) => {
    try {
        const db = getDB();
        const user = req.session.user;
        const userID = req.session.user._id;

        if (!user || !userID) {
            return res.status(401).send('Unauthorized: Session required for upload.');
        }

        const folder = {
            name: req.body.name,        
            userId: userID,   
            createdAt: new Date()
        }
        const result = await db.collection('folders').insertOne(folder);

        res.json({
         success: true, 
        });

    } catch (err) {
        console.error(err);
        res.status(500).send("Error creating folder");
    }
});

router.get('/add-file-to-folder', async (req, res) => {

})

module.exports = router;