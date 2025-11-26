const express = require('express');
const http = require('http');
const app = express();
const path = require('path');
const { dirname } = require('path/posix');
const port = 3000;
const { connectDB, getDB } = require('./db');
const session = require('express-session');
const noteRouter = require('./note');
const bcrypt = require('bcrypt');


//users and db is global
let users;
let db;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));


var ejs = require('ejs');
const { Session } = require('inspector/promises');
ejs.open = '{{';
ejs.close = '}}';

connectDB().then(() => {
    db = getDB();
    users = db.collection("users");
})


app.use(session({
    name: 'sessionIdCookie',
    secret: 'thisshouldbeasecret',
    resave: false,
    saveUninitialized: false, 
    cookie: {
        httpOnly: true,
        maxAge: 3600000, 
        secure: false,   
    }
}));

app.use('/notes', noteRouter);

app.get('/', (req, res) => {
    res.redirect('/home')
});

app.get('/login', (req, res) => {
    res.render("login", {message: null});
})

//opening home page
app.get('/home', (req, res) => {

    const user = req.session.user || null; 
    res.render('home', {user});
});

app.get('/sign-in', (req, res) => {
    res.render("sign_in");
});


const saltRounds = 10;

//sign up
app.post('/api/users', async (req, res) => {

    const { email, name, psw, pswRepeat } = req.body;
    if (psw != pswRepeat) return res.send("Passwords do not match!");
    
    const plainPassword = psw;
    const salt = await bcrypt.genSalt(saltRounds);
    const hashedPassword = await bcrypt.hash(plainPassword, salt)
    const user = {email, name, password: hashedPassword};

    try {
        await users.insertOne(user);
        req.session.user = user;
        res.redirect('/home');
    } catch (err) {
        res.status(500).json({ message: "Error creating user", error: err.message });
    }

});

//login
app.post('/api/login', async (req, res) => {

    const { email, psw } = req.body;
    const db = getDB();

    try {
        const userCollection = db.collection("users");
        const user = await userCollection.findOne({ "email": email })

       
        if (!user) {
            return res.status(401).json({ message: "Invalid Email." });
        }

        const passwordCompare = await bcrypt.compare(psw, user.password);
        if(!passwordCompare)
        {
            return res.status(401).json({message: "Invalid email or password"});
        }

        req.session.user =
        {
            _id: user._id,
            email: user.email,
            name: user.name
        };


         req.session.save(err => {
            if(err) {
                console.error("Session saving failed after login:", err);
                return res.status(500).json({ message: "Internal server error during session creation." });
            }
            res.redirect('/home');
         })
                  
    } catch (err) {
        res.status(500).json({ message: "Error logging in", error: err.message });
    }

});

//logout
app.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.log("Error destroying session");
            res.redirect('/');
        }
           res.render("home.ejs", {user: null});
    });
 
});

//get all users
app.get('/users', async (req, res) => {
    try{
        const allUsers = await users.find().toArray();
        res.json(allUsers);
    } catch (err)
    {
        res.status(500).json({message : "Error fetching users", error : err.message});
    }
})

//get a single user by email
app.get('/users/:email', async (req,res) => {
    try{
        const user = await users.findOne({email : req.params.email});
        if (!user) res.status(500).json({message : "Email not found", error : err.message})
        res.json(user);

    } catch (err)
    {
        res.status(500).json({message : "Error finding user", error: err.message})
    }
})




app.use(express.static(path.join(__dirname, 'public')));


app.listen(port, () => {
    console.log(`Note taking server running at http://localhost:${port}`);
});

