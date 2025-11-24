let mongo = require('mongodb');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');

dotenv.config();

let { MongoClient, GridFSBucket } = require('mongodb');
let url = `mongodb+srv://${process.env.MONGO_USER}:${process.env.MONGO_USER_PWD}@notes.ytpk8g3.mongodb.net/notesdb?appName=notes`;
const dbName = "notesdb"
let db;
let bucket;

async function connectDB() {
    const Client = new MongoClient(url);

    try {
        await Client.connect();
        db = Client.db(dbName);
        bucket = new GridFSBucket(db, { bucketName: "uploads" });
        return db;

    } catch (err) {
        console.error(err);
    }
}

function getDB() {
    if (!db) throw new Error("Database not connected");
    return db;
}

function getBucket() {
    if (!bucket) throw new Error("Bucket not initialized");
    return bucket;
}

async function uploadFile(filepath, userId) {
    if (!bucket) throw new Error("Database not connected yet");
    const folderIdValue = folderId || '';
    const filename = path.basename(filepath); //gets the file name from the file path
    const uniqueId = uuidv4(); //generates a unique ID for the file
    const metadata = { //this is the metadata of the file that is uploaded
        userId: userId,
        uniqueId: uniqueId,
        folderId : folderIdValue
    };

    const uploadStream = bucket.openUploadStream(filename, {metadata: metadata});
    const fileId = uploadStream.id; //assigns the unique id of the mongoDB to the file being uploaded
    const readStream = fs.createReadStream(filepath); //reads the file from the local file system

    readStream.pipe(uploadStream); 

    return new Promise((resolve, reject) => {
        uploadStream.on("finish", () => {
            console.log("File uploaded to MongoDB!", fileId.toString());
            resolve(fileId);
        });

        uploadStream.on("error", (err) => {
            console.error("Upload error:", err);
            reject(err);
        });
    });
}



module.exports = { connectDB, getDB, uploadFile, getBucket};