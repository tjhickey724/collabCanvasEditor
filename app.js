// Start with
//   DEBUG=msetdemo:* npm start
//

const createError = require('http-errors');
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const cors = require('cors');
const layouts = require("express-ejs-layouts");
const debug = require('debug')('msetdemo:server');

const User = require('./models/User')


//const app = require('express')();
const app = express();
const http = require('http'); //.Server(app);
const httpServer = http.Server(app)

const io = require('socket.io')(httpServer);

let configAuth = null;

console.log('process.env =')
console.dir(process.env)

//configAuth = require('./auth');
configAuth = {mongoDB_URI:process.env.mongodb_URI}

const mongoDB_URI = configAuth.mongoDB_URI

const mongoose = require( 'mongoose' );
//mongoose.connect( `mongodb+srv://${auth.atlasAuth.username}:${auth.atlasAuth.password}@cluster0-yjamu.mongodb.net/authdemo?retryWrites=true&w=majority`);
//mongoose.connect( 'mongodb://localhost/authDemo');

//const mongoDB_URI = process.env.MONGODB_URI
mongoose.connect(mongoDB_URI)

const db = mongoose.connection;
db.on('error', console.error.bind(console, 'connection error:'));
db.once('open', function() {
  console.log("we are connected!!!")
});

const authRouter = require('./routes/googleAuth');
const isLoggedIn = authRouter.isLoggedIn

//app.get('/', function(req, res){
//	res.sendFile(__dirname + '/index.html');
//    });

let msetId=1


// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

app.use(cors());
app.use(layouts);

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use(authRouter)

app.get('/', (req,res,next) => {
  console.log("showing index file")
  res.render('index')
});

app.get('/editor', (req,res,next) => {
  console.log('visiting selectFile')
  res.render('selectFile')
})

app.post('/editor', (req,res,next) => {
  res.redirect('editor/'+req.body.file)
})

app.get('/editor/:room', (req,res,next) => {
  res.locals.room = req.params.room
  res.render('editor')
})


app.get('/loadEditor/:room', (req,res,next) => {
  const room = req.params.room
  res.type('.js')
  res.render('loadEditor',{ layout: 'no-layout', namespace:'/demo2', documentId:room })
})

app.get('/profiles',
    isLoggedIn,
    async (req,res,next) => {
      try {
        res.locals.profiles = await User.find({})
        res.render('profiles')
      }
      catch(e){
        next(e)
      }
    }
)

app.get('/profile',
      isLoggedIn,
      (req,res) => {
        res.render('profile')
      }
)

app.use('/publicprofile/:userId',
    async (req,res,next) => {
      try {
        let userId = req.params.userId
        res.locals.profile = await User.findOne({_id:userId})
        res.render('publicprofile')
      }
      catch(e){
        console.log("Error in /profile/userId:")
        next(e)
      }
    }
)


// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error');
});



module.exports = app;

const io1 = io.of('/demo1')
io1.on('connection', function(socket){
  console.log('a user connected');
  socket.on('operation',function(msg){
    console.log('operation: '+msg);
    console.dir(msg);
    io1.emit('remoteOperation',msg);
  })
  socket.on('disconnect', function(){
    console.log('user disconnected');
  });
  socket.emit('msetId',msetId++);
});

const io2 = io.of('/demo2')
let oplist = {default:[]};
io2.on('connection', function(socket){

  console.log('a user connected');

  socket.on('operation',function(msg){
    let z=(oplist[msg.fileId] || [])
    z.push(msg);
    oplist[msg.fileId]=z
    io2.emit('remoteOperation',msg);
  })

  socket.on('reset',function(msg){
    let z=(oplist[msg.fileId] || [])
    socket.emit('reset',{oplist:z});
  })

  socket.on('disconnect', function(){
    console.log('user disconnected');
  });

  console.log("sending id");
  socket.emit('msetId',{msetId:msetId++});
  console.log(msetId)
  //console.dir(oplist)
});



var port = normalizePort(process.env.PORT || '5000');
app.set('port', port);

/**
 * Create HTTP server.
 */

//var server = http.createServer(app);

/**
 * Listen on provided port, on all network interfaces.
 */

httpServer.listen(port);
httpServer.on('error', onError);
httpServer.on('listening', onListening);

/**
 * Normalize a port into a number, string, or false.
 */

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

/**
 * Event listener for HTTP server "error" event.
 */

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

/**
 * Event listener for HTTP server "listening" event.
 */

function onListening() {
  var addr = httpServer.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}

//http.listen(5000, function(){
//	console.log('listening on *:5000');
//    });
