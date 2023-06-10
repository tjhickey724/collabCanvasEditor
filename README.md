# collabCanvasEditor

This is a pre-alpha demo of a canvas-based collaborative editor that runs in the browser.

## Install and Run
You can start up the server by downloading the code and starting it up as usual for Express apps:
``` linux
% npm install
% npm start
```

This creates a server which allows you to create files to collaboratively edit by visiting 
http://localhost:5000/editor/FILENAME
If you want to allow people to access it from outside then use ngrok..

## Current Status
The system currently works well as a single person editor as long as you don't resize the screen
or change the default font size.  It also works as a multi-person collaborative editor if the complete
document stays completely on everyone's screen! Clearly it is not yet at the Minimal Viable Product stage.

## Design

The editor uses the [MSET technology](https://github.com/tjhickey724/MSET) 
and it currently allows the user to insert printable characters,
to use the arrow keys, and to click with the mouse to change the cursor position. It does not yet have
a way to slide the view up and down the document with the mouse.

All editing operations are sent to all of the other collaborators.
Anyone who joins late sees the entire document being recreated and then can edit themselves...

The system is designed to allow (eventually) thousands of simultaneous editors with very little local lag.
Each local or remote edit operation takes time O(log(E)) where E is the number of editing operations
that have been performed so far. If E gets sufficiently large, then the system will invoke a garbage
collector which takes linear time. By garbage collecting when E is about N/log(N) this gives an
amortized time per edit operation of O(log(N))  (as N/(N/log(N)) = log(N))

The current version still has some bugs, especially if the user changes the font size (CMD + or CMD - on the Mac).

The underlying collaboration algorithm (MSET) has been extensively tested for both correctness and performance.
We are working on providing proofs for the correctness and efficiency of this canvas-based editor.

The goal is to have a practical editor which can handle tens of thousands of simultaneous editors all using simple
laptops with no local lag (though I'm not sure how many simultaneous connections socket.io can handle!)
