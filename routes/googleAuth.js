const express = require('express');
const router = express.Router();

/*
this is a router to handle authentication
*/
console.log("******** in googleAuth *********")


const session = require("express-session")
const bodyParser = require("body-parser")
const flash = require('connect-flash')
const mongoose = require( 'mongoose' );
const MongoStore = require('connect-mongo')(session)

const GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;
// here we set up authentication with passport
const passport = require('passport')

// config/passport.js

// load all the things we need
//var LocalStrategy    = require('passport-local').Strategy;
//var FacebookStrategy = require('passport-facebook').Strategy;
//var TwitterStrategy  = require('passport-twitter').Strategy;
//var GoogleStrategy = require('passport-google-oauth').OAuth2Strategy;

// load up the user model
const User = require('../models/User');



const configPassport = function(passport) {

    // used to serialize the user for the session
    passport.serializeUser(function(user, done) {
      console.log('in serializeUser '+user)
        done(null, user.id);
    });

    // used to deserialize the user
    passport.deserializeUser(function(id, done) {
      console.log('in deserializeUser')
        User.findById(id, function(err, user) {
            done(err, user);
        });
    });

    // code for login (use('local-login', new LocalStategy))
    // code for signup (use('local-signup', new LocalStategy))
    // code for facebook (use('facebook', new FacebookStrategy))
    // code for twitter (use('twitter', new TwitterStrategy))

    // =========================================================================
    // GOOGLE ==================================================================
    // =========================================================================
    // load the auth variables
    /*
    var configAuth = require('./auth');
    const clientID = configAuth.googleAuth.clientID
    const clientSecret = configAuth.googleAuth.clientSecret
    const callbackURL = configAuth.googleAuth.callbackURL
    */
    let configAuth={}
/*  switch the comments to use either environment variables or the auth.js file
    to define the clientID etc.
    */
//      configAuth = require('../auth');
/*   */
      configAuth = {
        googleAuth:{
          clientID: process.env.clientID,
          clientSecret: process.env.clientSecret,
          callbackURL: process.env.callbackURL}
        }
        console.log('process.env =')
        console.dir(process.env)

    /*
    var configAuth = require('../auth');
    */
    const clientID = configAuth.googleAuth.clientID
    const clientSecret = configAuth.googleAuth.clientSecret
    const callbackURL = configAuth.googleAuth.callbackURL

    /*
    const clientID = process.env.clientID
    const clientSecret = process.env.clientSecret
    const callbackURL = process.env.callbackURL
    */
    passport.use(new GoogleStrategy({

        clientID        : clientID,
        clientSecret    : clientSecret,
        callbackURL     : callbackURL,

    },
    function(token, refreshToken, profile, done) {

        // make the code asynchronous
        // User.findOne won't fire until we have all our data back from Google
        process.nextTick(function() {
           console.log("looking for userid .. making call to User.findOne")
            // try to find the user based on their google id
            User.findOne({ 'googleid' : profile.id }, function(err, user) {
                console.log("inside callback for User.findOne")
                console.dir(err)
                console.dir(user)
                console.log("\n\n")
                if (err){
                    console.log("error in nextTick:"+err)
                    return done(err);
                } else if (user) {
                    console.log(`the user was found ${user}`)
                    // if a user is found, log them in
                    return done(null, user);
                } else {
                    console.log(`we need to create a new user`)
                    console.dir(profile)
                    console.log(`\n****\n`)
                    // if the user isnt in our database, create a new user
                    var newUser
                     = new User(
                         {googleid: profile.id,
                          googletoken: token,
                          googlename:profile.displayName,
                          googleemail:profile.emails[0].value,
                        });

                    // set all of the relevant information
                    /*
                    newUser.google = {}
                    newUser.google.id    = profile.id;
                    newUser.google.token = token;
                    newUser.google.name  = profile.displayName;
                    newUser.google.email = profile.emails[0].value; // pull the first email
                    */
                    // save the user
                    newUser.save(function(err) {
                      console.log("saving the new user")
                        if (err)
                            throw err;
                        return done(null, newUser);
                    });
                }
            });
        });

    }));

};

//const configPassport = require('../config/passport')
configPassport(passport)

router.use(session(
  {secret: 'zzbbyananaresasd4322',
   resave: false,
   saveUninitialized: false,
   cookie:{maxAge:24*60*60*1000}, // allow login for one day...
   store:new MongoStore({mongooseConnection: mongoose.connection})}))
router.use(flash());
router.use(passport.initialize());
router.use(passport.session());
router.use(bodyParser.urlencoded({ extended: false }));



const approvedLogins = ["tjhickey@brandeis.edu", "tjhickey724@gmail.com","csjbs2018@gmail.com"];

// here is where we check on their logged in status
router.use((req,res,next) => {
  res.locals.title="Authentication Demo"
  res.locals.loggedIn = false
  if (req.isAuthenticated()){
      res.locals.user = req.user
      res.locals.loggedIn = true
    }
  else {
    res.locals.loggedIn = false
  }
  next()
})


// here are the authentication routes

router.get('/loginerror', function(req,res){
  res.render('loginerror',{})
})

router.get('/login', function(req,res){
  res.render('login',{})
})



// route for logging out
router.get('/logout', function(req, res) {
        req.session.destroy((error)=>{console.log("Error in destroying session: "+error)});
        req.logout();
        res.redirect('/');
    });


// =====================================
// GOOGLE ROUTES =======================
// =====================================
// send to google to do the authentication
// profile gets us their basic information including their name
// email gets their emails
router.get('/auth/google', passport.authenticate('google', { scope : ['profile', 'email'] }));


router.get('/login/authorized',
        passport.authenticate('google', {
                successRedirect : '/',
                failureRedirect : '/loginerror'
        })
      );


// route middleware to make sure a user is logged in
function isLoggedIn(req, res, next) {
    res.locals.loggedIn = false
    if (req.isAuthenticated()){
      res.locals.loggedIn = true
      return next();
    } else {
      res.redirect('/login');
    }
}

router.isLoggedIn = isLoggedIn;

module.exports = router;
