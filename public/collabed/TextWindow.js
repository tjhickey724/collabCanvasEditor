//import {DDLLstring} from "./DDLLstring.js"
import {DDLL} from '../mset/DDLL.js'
export {TextWindow}

class Queue extends Array {
    enqueue(val) {
        this.push(val);
    }

    dequeue() {
        return this.shift();
    }

    peek() {
        return this[0];
    }

    isEmpty() {
        return this.length === 0;
    }
}

class TextWindow{
  /**
    This class will represent a text object and a window onto that text object.
    Its methods are called by the CanvasEditor class which responds to user input
    It maintain the state of the underlying document (a string) as well as the
    cursor.  The user interactions (arrow keys, inserting, deleting, mouse clicks)
    introduce changes in the cursor position which are detected in CanvasEditor
    and handled in TextWindow. This class does need to call the redraw() method
    when remote operations are processed!

    This class processes insertion and deletion operations from the
    local user and from remote users.  It applies the operations to the
    underlying MSET data structure and it keeps track of a few key values
    that allow it to draw the relevant part of the document on the string.
    The nine operations are:
      remoteRemoveCharBeforePos(p)
      remoteInsertCharAtPos(char,pos)
      insertCharAtCursorPos(char)
      removeCharBeforeCursorPos()
      move cursor forward, backward, up, down
      move cursor to where mouse clicked
    When necessary we can pull in a new line using the method
      this.getLineContainingPosFAST(pos)
    which returns the line containing that position
    as well as where it starts and ends:
       [line,startPos,endPos]

    In particular it keeps track of
    this.lines = the list of lines which are (at least partly) visible on the screen
    this.viewStart = the position before the first character of the first "visible" line
    this.viewEnd = the position after the last visible character
    this.docSize = the total number of characters in the document
    this.cursorPos = the position right before the cursor
    this.rows = the number of visible rows
    this.cols = the number of visible columns

    With these seven values it can accurately draw the visible part of
    the document on the screen...

  **/

  constructor(ddllSpec){

    // these are the necessary state variables
    this.viewStart = 0  // the position of 1st visible character in the viewStart
    this._viewEnd = 0
    this.cursorPos = 0 //
    this.rows = 10
    this.cols = 80
    this.colOffset=0
    this.docSize=0

    // these are all computed state variables
    this.lines=[""] // cached text!

    this.lastRow = 0
    this.cursor = [0,0]
    this.rowOffset=0

    this.scrollOffset = 1 // this is for how much you want to scroll when recentering...

    this.redrawCanvas = ()=> {
      //console.log("redrawing not initialized yet")
    }

    this.debugging=true

    this.opQueue = new Queue()

    this.editorCallbacks =
      (op,pos,elt,user,me) =>{
         this.opQueue.enqueue([op,pos,elt,user,me])
         setTimeout(this.processOps,0)

       }
    this.processOps = async () => {
      if (!this.opQueue.isEmpty()){
        const editOp = this.opQueue.dequeue()
        // apply the editorCallBack
        this.editorCallbacks2.apply(null,editOp)
        if (!this.opQueue.isEmpty()){
          await this.processOps()
          //setTimeout(this.processOps,0)
        }
        // if opQueue is not empty, then setTimeout again...
      }
    }



    this.editorCallbacks2 =
      (op,pos,elt,user,me) =>{
        // first we do some local processing
        ///console.log(`\nZZZ editorCallback(${op},${pos},${elt},${user},${me})`)
        const theLines = this.ddll.toString('','std')
        //console.log(`theLines=${JSON.stringify(theLines,null,2)}`)
        //this.printState()
        switch(op){
          case "init":
            break
          case "insert":
            //console.log("insert callback\n"+JSON.stringify([ta1.readOnly,'insert',pos,elt,user,me]))
            if (user==me) {
              //console.log("skipping my own op")
              return
            }
            // adjust the viewStart and cursorPos and docSize
            // TJH 8/2/21 we may need to update colOffset or rowOffset ...
            // Also reloadLinesFAST might make the lines array too long
            // i.e. bigger than the window and so we need to remove the last lines
            // and update viewEnd, or viewStart to keep the curson on the screen...
            //THIS IS ALL BROKEN!!  it should be adjusting the viewStart, viewEng
            // and colOffset to keep the cursor visible ...
            this.docSize++
            if (pos<this.viewStart){
              this.viewStart++
              this.viewEnd++
              this.cursorPos++
            } else if (pos < this.viewEnd){
              // need to update the data to keep the cursor in the window ...
              // if elt=='\n' then
              //   maybe look at getVisRowColFAST to get cursor position
              //   and then update the state as needed,
              // of ir cursor row is = cols-1  (i.e. AT THE RIGHT EDGE)
              //   then add 1 to colOffset ...
              this.doInsertionLogic(elt, pos, false)
              this.redraw()
            }
            break
          case "delete":
            //console.log("in delete callback\n"+JSON.stringify([ta1.readOnly,'delete',pos,elt,user,me]))
            if (user==me) {
              //console.log("skipping my own op")
              return
            }
            // adjust the viewStart and cursorPos and docSize
            this.docSize--
            if (pos<this.viewStart){
              this.viewStart--
              this.cursorPos--
              this.viewEnd--
            } else if (pos <= this.cursorPos){
              this.cursorPos--
              this.viewEnd--
              this.reloadLinesFAST()
              this.redraw()
            }else if (pos <= this.viewEnd){
              this.viewEnd--
              this.reloadLinesFAST()
              this.redraw()
            }

            break
        }
        //console.log("Just processed a remote operation "+op+" "+pos)
        //console.log("**********************************")

      }

      this.ddll =
          new DDLL([],
                   this.editorCallbacks,
                   io(ddllSpec.namespace),
                   ddllSpec.documentId)

      //console.log(`this.ddll=${this.ddll}`)
      //console.dir(this.ddll)

      this.ddll_lines =
         () => this.ddll.msetTree.toList2('std').join('').split("\n")

  }
  //TODO: remove getter and setter when done debugging
  get viewEnd(){
    return this._viewEnd
  }

  set viewEnd(value){
    this._viewEnd = value
    //console.log('viewEnd changed to ' + value)
    //console.trace()
  }

  printState(text){
    if (!this.debugging){
      return
    }
    if (!this.ddll.msetTree.toList2){  //wait for msetTree to initialize
      return
    }
    text = text || ""
    // print the current state of the editor
    /*console.log(`\n********************
${text}
EDITOR STATE: ${new Date()}
rows=${this.rows} cols=${this.cols}
rowOffset=${this.rowOffset} numRows=${this.lines.length}
colOffset = ${this.colOffset}
viewStart=${this.viewStart} viewEnd=${this.viewEnd} this=${this}
lastRow = ${this.lastRow}
lines = ${JSON.stringify(this.lines,null,2)}
ddl_lines = ${JSON.stringify(this.ddll_lines(),null,2)}
cursor=${JSON.stringify(this.cursor,null,2)}
cursorPos = ${this.cursorPos}
docSize = ${this.docSize}
**********************\n`)
*/
    //let lines0 = this.reloadLinesFAST(this.viewStart,this.lastviewStart)
    //console.log(`lines0 = ${JSON.stringify(lines0,null,2)}`)
  }

  printOffsetData(){
    if (!this.debugging){
      return
    }
    if (this.ddll.msetTree.toList2){
      //console.log(`toList2=${JSON.stringify(this.ddll.msetTree.toList2())}`)
    }
    //console.log(`wo=${this.viewStart} lwo=${this.viewEnd} cursorPos=${this.cursorPos}\nds=${this.docSize} rows=${this.rows} cols=${this.cols}\nrowOffset=${this.rowOffset} colOffset=${this.colOffset}`)
  }
/*
  moveCursor(k){
    // this advances the cursor forward or backward in the viewing region
    //console.log(`moveCursor(${k})`)
    this.printOffsetData()
    this.cursorPos += k
    this.cursorPos = Math.max(0,Math.min(this.cursorPos,this.docSize))
    this.centerView()
    this.printOffsetData()
  }
*/


  recenterView(){
    //console.log('recenterView')
    //this.printState()
    // this is called when the screen size changes and the cursor moves
    // out of the view ... the idea is to find the cursorPos row and column
    // and readjust so the cursor appears on the screen.
    // We can assume that this.rows and this.cols has changed but that
    // this.lines has not
    const [row,col] = this.getVisRowColFAST(this.cursorPos)

    const start=Math.max(0,row-this.rows+1) //earliest start with cursorPos in view
    //console.log(`row,col,start= ${JSON.stringify([row,col,start])}`)
    if (this.lines.length != this.rows) {
        // move viewStart up to the starting row
        for (let i=0; i<start; i++){
          this.viewStart += this.lines[i].length + 1
        }
        // slice away any extra lines at the end
        this.lines = this.lines.slice(start,start+this.rows)
        // recalculate viewEnd
        this.viewEnd=this.viewStart
        for(const line of this.lines){
          this.viewEnd += line.length + 1
        }
        this.viewEnd -= 1 // move it to the end of the last row ...

        // pull in extra rows if needed (e.g. if text size is shrunk)
        for(let i=this.lines.length; i<this.rows && this.viewEnd + 1 <= this.docSize; i++){
          const [line,startP,endP]
                = this.getLineContainingPosFAST(this.viewEnd+1)
          this.lines[i] = line
          this.viewEnd += this.lines[i].length+1
        }
    }

    if (col> this.colOffset + this.cols || col < this.colOffset){
      this.colOffset = Math.max(0,col-this.cols+1)
    }

    //console.log("at end of recenter")
    //this.printState()


  }

  moveCursorRight(){
    // this advances the cursor forward (i.e. to the right)in the viewing region
    //console.log(`moveCursorRight()`)
    //this.printOffsetData()
    if (this.cursorPos==this.docSize){
      //console.log("can't move past end of document")
      return
    }


    //this.cursorPos = Math.max(0,Math.min(this.cursorPos,this.docSize))
    if (this.cursorPos == this.viewEnd) {
      // cursor position goes one character beyond the view
      // so we need to pull in another line
      // in this case it at the end of the last line of the view
      this.cursorPos += 1
      // now it at the beginning of the next line, which could be empty

      // pull in new line ... make sure this works when viewEnd=docSize
      const [line] = this.getLineContainingPosFAST(this.viewEnd+1)
      //console.log(`new line is ${JSON.stringify(line,null,2)}`)
      // move the viewStart to the beginning of the previous line
      //this.viewStart += this.lines[0].length + 1

      // we move the viewEnd to the end of the next line
      // so we have to advance past the CR and then past each of the
      // characters in the line:
      this.viewEnd += line.length+1
      // we add the line to the array of lines in the view
      // and set the column offset to zero as the cursor
      // is now at the beginning of a line
      this.lines = this.lines.concat(line)
      this.colOffset=0
      //this.printOffsetData()

      // if we are at the end of the document, then this.lines might not be full
      // if was full before advancing, then we need to remove the first row
      // and update viewStart
      if (this.lines.length>this.rows){
        // if the view is full, then move the viewStart up
        // to the beginning of the 2nd line
        const firstLine = this.lines[0]
        this.viewStart += firstLine.length+1
        // and remove the first line from this.lines
        this.lines = this.lines.slice(1)
        // at this point this.lines.length = this.rows
      }
    } else {
      // cursorPos is not at the end of the view
      // and so it will stay within the view
      // and we don't have to change viewStart, viewEnd, this.lines, or this.docSize
      this.cursorPos += 1
      // we may need to update colOffset though
      // if we are careful about keeping track of this.col
      // then we won't have to make this call to getViwRowColFAST
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //console.log(`[r,c]=${JSON.stringify([row,col],null,2)}`)
      if (col > this.colOffset+this.cols){
        this.colOffset+=1
      } else if (col < this.colOffset){
        // when we go past a CR to the next line
        this.colOffset=0
      }
    }



    //this.centerView()
    //this.printOffsetData()
  }

  moveCursorLeft(){
    // this advances the cursor backward (i.e. to the left) in the viewing region
    //console.log(`moveCursorLeft()`)
    //this.printOffsetData()
    if (this.cursorPos==0){
      // we can't advance before position zero, so just return
      // this happens if the user presses the left arrow when the
      // cursor is at the beginning of the document
      return
    } else if (this.cursorPos == this.viewStart){
      // in this case the cursor is at the beginning of the view
      // and we need to pull in a new line and possibly adjust this.lines and viewEnd

      this.cursorPos -= 1

      // since we are at the beginning of a line, the previous character
      // is a CR and each CR is considered to be at the end of a line
      // so getting the line containing that CR will pull in all of the
      // characters before it up to the next CR or the beginning of the document
      const [line] = this.getLineContainingPosFAST(this.viewStart-1)

      // also, we need to adjust the column offset as the cursor is now
      // at the end of the first line in the view
      this.colOffset = Math.max(0,line.length-this.cols+1)
      //console.log(`new line is ${JSON.stringify(line,null,2)}`)

      // move the viewStart to the beginning of the previous line
      this.viewStart -= line.length + 1

      if (this.lines.length==this.rows){
        // if the view is full, then move the viewEnd up
        // to the end of the 2nd to the last line
        const lastLine = this.lines[this.lines.length-1]
        this.viewEnd -= lastLine.length+1
        // and add the first line and remove the last
        this.lines.unshift(line)
        // remove the last line
        this.lines = this.lines.slice(0,this.rows)
      } else {
        // add the first line, but don't remove any lines
        this.lines.unshift(line)
      }

    } else {
      // the cursor will remain in the view when moved Left
      this.cursorPos -= 1
      // we do need to possibly adjust the colOffset
      // but first we need to find the current column
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //console.log(`[r,c]=${JSON.stringify([row,col],null,2)}`)
      // Note that the cursor was at the beginning of a line,
      // then it would jump to the end of the previous line
      // and we need to adjust the colOffset so it will be
      // visible as the last character on the line
      if (col > this.colOffset+this.cols){
        // this happens if we move to the end of the previous line
        // this offset makes
        this.colOffset = Math.max(0,col-this.cols)
      } else if (col < this.colOffset){
        // this happens when we scroll past the left side of the view
        // and we need to reset the view
        this.colOffset = Math.max(0,col-this.cols)
      } else {
        // in this case there is nothing to do as the cursor
        // is still in the view
      }

    }

  }



  moveCursorUp(){
    /*
      This is an optimally efficient implementation of the moveCursorUp
      operation. It only goes back to the document if it has to.
      moveCursorDown is very similar...
    */
    //console.log(`moveCursorUp()`)
    //this.printOffsetData()
    //console.log("moveCursorUp")
    //console.log(JSON.stringify(this.lines,null,2))

    // if the user is on the first line then you can't move up
    // this happens when viewStart==0
    // and when the cursor in on the first line
    // the last position on the line (right after the last character)
    // has position this.lines[0].length
    if (this.viewStart==0 && this.cursorPos<=this.lines[0].length){
      //console.log("can't move up from first line")
      return
    } else if (this.cursorPos-this.viewStart>this.lines[0].length){
      //console.log("moving within the window)")
      // here we move up without changing the viewStart
      // this is the case where we are not on the first line
      // and we can stay in the same window if we move up ...
      // we need to find our current column so
      // we can adjust the cursor position correctly...
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //console.log(`grcFast => row col = ${row} ${col}`)
      // the challenge here is finding which column
      // the cursor will advance to (as the previous line could be short)
      // We will move to the beginning of the current line
      // Then use the length of the previous line to move to the
      // beginning of the previous line
      // then move out to the proper column, knowing the line could be short
      const prevLineLen = this.lines[row-1].length
      //console.log(`previous line length = ${prevLineLen}`)
      const newRow = row-1 + this.rowOffset
      const newCol = Math.min(col,prevLineLen)
      this.cursorPos =
           this.cursorPos - col   // this puts us at the beginning of the line
           - (prevLineLen+1) // this move us to the beginning of the previous line
           + newCol  // this moves us to the appropriate column
      //console.log(`new cursorPos=${this.cursorPos}`)
      //console.log(`new cursor = ${newRow} ${newCol}`)

      // here we store the row and col of the cursor
      // but this hasn't been done everywhere so we can't use this info yet...
      this.cursor = [newRow,newCol]
      return
    } else {
      // this is the case where we are on the first line of the view, but
      // not the first line of the file, so we need to pull in a new line
      // and, if the view is full, then remove the last line and update the
      // viewStart and possibly viewEnd as well as the cursorPos
      //console.log("pulling in a new line")

      // once again we start by getting the current row and column of the cursor
      // we really should cache this!!
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //console.log(`row col = ${row} ${col}`)

      // now we pull in the previous line
      // viewStart-1 is the position at the end of the previous line
      // and getLineContainingPosFAST will pull in that entire line
      // as the CR at position viewStart-1 is considered to be the end of a line
      const [line] = this.getLineContainingPosFAST(this.viewStart-1)
      //console.log(`new line is ${JSON.stringify(line,null,2)}`)

      // move the viewStart to the beginning of the previous line
      this.viewStart -= line.length + 1

      // Next we adjust the cursor position
      const firstLineLen = line.length+1
      //console.log(`lines=${JSON.stringify(this.lines,null,2)}`)
      const newRow = row - 1
      const newCol = Math.min(col,line.length)
      this.cursor = [newRow,newCol]

      this.cursorPos =
          this.cursorPos - col   // move to beginning of the current line
          - (line.length+1)      // move to the beginning of previous line
          + newCol               // move to the appropriate column
      //console.log(`cp=${this.cursorPos}`)

      if (this.lines.length==this.rows){
        // if the view is full, then move the viewEnd up
        // to the end of the 2nd to the last line
        // we need to advance past all characters on the line
        // and past the CR at the end of the penultimate line
        // as the viewEnd always sits at the end of the line but
        // before the CR which marks the end
        // (except when at the end of the file not terminated by CR)
        this.viewEnd -= this.lines[this.rows-1].length+1
        // add the new line to the front
        this.lines.unshift(line)
        // remove the last line
        this.lines = this.lines.slice(0,this.rows)

      } else {
        // add the new line to the front
        this.lines.unshift(line)
        // but don't remove any lines at the end
      }



    }
    //this.printOffsetData()
    //this.reloadLinesFAST()
    //this.printOffsetData()
  }

  moveCursorDown(){
    /*
      This is an optimally efficient implementation of the moveCursorUp
      operation. It only goes back to the document if it has to.
      moveCursorDown is very similar...
    */
    //console.log(`moveCursorDown()`)
    //this.printOffsetData()
    //console.log("moveCursorDown")
    //console.log(JSON.stringify(this.lines,null,2))
    const lastLine = this.lines[this.lines.length-1]
    if (this.viewEnd==this.docSize
        &&
        this.docSize - lastLine.length <= this.cursorPos) {
      // this is the case where we are on the last line of the document
      // Notice that the last line does not contain a CR at the end
      // because in that case we could be at the position after the CR
      // (cursorPos==docSize) and the last line would be an empty line
      // so the first position on the last line is at
      // this.docSize-lastLine.length
      //console.log("can't move below the last line")
      return
    } else if (this.viewEnd - lastLine.length <= this.cursorPos){
      // this is the case when we are on the last line of the view
      // which is not the last line of the file and so my moving down
      // we will need to pull in another line
      // console.log("pulling in a new line from last line")
      //
      // first we get the next line.  Note that this.viewEnd
      // is the position right before the CR at the end of the line
      // so this.viewEnd+1 is the position at the beginning of the next line
      const [line] = this.getLineContainingPosFAST(this.viewEnd+1)
      // the current line is the last line in the view
      const curLine = this.lines[this.lines.length-1]
      // our current column is the cursorPos - beginning of the last line
      const col = this.cursorPos - (this.viewEnd - curLine.length)
      //const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //const curLine = this.lines[row]
      //const [line] = this.getLineContainingPosFAST(this.viewEnd+1)
      //console.log(`new line is ${JSON.stringify(line,null,2)}`)
      // move the viewStart to the beginning of the previous line
      //this.viewStart += this.lines[0].length + 1

      // we can now adjust the viewEnd by adding the CR and the chars of the line
      this.viewEnd += line.length+1



      if (this.lines.length==this.rows){
        // if the view is full, then move the viewEnd up
        // to the beginning of the 2nd line
        this.viewStart += this.lines[0].length+1
        //add the new line to the end of this.lines
        this.lines = this.lines.concat(line)
        // slice away the first line from this.lines
        this.lines = this.lines.slice(1)
      } else {
        // then add the new line to the front of this.lines
        this.lines = this.lines.concat(line)
        // but leave viewStart alone and don't slice off any lines
      }
      //console.log(`wo=${this.viewStart} lwo=${this.viewEnd}`)


      // adjust the cursor position
      const lastLineLen = line.length+1
      //console.log(`lines=${JSON.stringify(this.lines,null,2)}`)
      const newCol = Math.min(col,line.length)
      this.cursor = [this.cursor[0]+1,newCol] // assuming this.cursor is accurate

      this.cursorPos =
          this.cursorPos - col   // move to beginning of current line
          + (curLine.length+1)   // move to begining of next line
          + newCol               // move to appropriate column
      //console.log(`cp=${this.cursorPos}`)
    } else {
      // this is the case where we can move down with out having to add a line
      // we start by getting the row and column
      // if we are careful we don't need to make this call!
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      //console.log(`grcFast => row col = ${row} ${col}`)
      //console.log("moving within the window)")
      // here we move up without changing the viewStart
      const nextLine = this.lines[row+1]
      const currLine = this.lines[row]
      //console.log(`next line length = ${nextLineLen}`)

      const newRow = row+1 + this.rowOffset
      const newCol = Math.min(col,nextLine.length)
      this.cursorPos =
           this.cursorPos - col   // move to beginning of line
           + (currLine.length+1)  // move to beginning of next line
           + newCol               // move to appropriate column
      //console.log(`new cursorPos=${this.cursorPos}`)
      //console.log(`new cursor = ${newRow} ${newCol}`)

      this.cursor = [newRow,newCol]

    }
    //this.printOffsetData()
    //this.reloadLinesFAST()
    //this.printOffsetData()
  }



/*
  getPosSLOW(row,col) {
    const lines = this.ddll_lines()
    //console.log(`getPosSLOW(${row},${col})`)
    //console.log(`lines=${JSON.stringify(lines,null,2)}`)
    let pos = 0
    for(let i=0; i<Math.min(row,lines.length); i++){
      pos += lines[i].length+1
    }
    if (row>=lines.length){
      return pos-1
    } else if (row<0){
      return 0
    } else {
      pos += Math.min(lines[row].length,col)
      return pos
    }

  }

*/

getPosFAST(row,col) {
  // this takes the row/col in the view (where the first line is row 0)
  // and returns the position in the entire document ...
  // this is used when making a mouse click to determine the position
  // in the document, so the row could be too small or too large
  // as could the column. We begin by normalizing the row value
  //console.log(`getPosFAST(${row},${col})`)
  //this.printState()

  if (row<0) {
    row=0
  } else if (row>=this.lines.length){
    row = this.lines.length-1
  }
  //console.log(JSON.stringify(this.lines,null,2))
  // and then the column value
  col = Math.min(col,this.lines[row].length)
  //console.log(`row=${row} col=${col}`)
  //console.log(`getPosSLOW(${row},${col})`)
  //console.log(`lines=${JSON.stringify(lines,null,2)}`)
  // we start at the position at the beginning of the first line of the view
  let pos = this.viewStart
  //row = Math.min(row,lines.length)
  // for each line before the specified row
  // we add the characters in the row and the CR at the end
  for(let i=0; i<row; i++){
    //console.log(`i=${i} this.lines[i]=${JSON.stringify(this.lines[i],null,2)}`)
    pos += this.lines[i].length+1
  }
  // for the row itself, we add the column to get the position
  pos += col

  return pos
}

/*
  getCursorRowCol(){
    // we assume this is only called when the cursor is in the view

    if (this.cursorPos < this.viewStart || this.cursorPos > this.viewEnd){
      console.log(`ERROR: in getCursorRowCol(${this.cursorPos})`)
      return this.getCursorRowColSLOW()
    }
    let p=this.viewStart
    let prevOffset=0
    let row = 0
    //console.log(`this.lines = ${JSON.stringify(this.lines,null,2)} row=${row}`)
    while (p <= this.cursorPos && row<this.lines.length){
      prevOffset = p
      p+= this.lines[row].length+1
      row += 1
    }
    if (row>this.lines.length){
      //at end of last line with a CR
      row++
      prevOffset=p
    }
    let cursorRow = row-1
    let cursorCol = this.cursorPos - prevOffset
    this.cursor = [cursorRow,cursorCol]
    return this.cursor
  }
*/

  getVisRowColFAST(pos){
    // this returns the visible row and actual col in the viewing window for a specified position
    // so anything in the first row of the view has row=0

    // We assume that pos is in the viewing window
    //console.log(`in getVisRowColFast ${pos}, range ${this.viewStart} ${this.viewEnd}`)
    //this.printState()

    if (pos<this.viewStart || pos > this.viewEnd){
      throw new Error(`call to getVisRowColFast(${pos}) out of range [${this.viewStart},${this.viewEnd}]`)
    }
    //console.log(`gvrcF(${pos})`)
    //this.printState()
    /*
    if (pos < 0) {
      pos=0
    } else if (pos > this.docSize){
      pos=this.docSize
      //console.log(`ERROR: in getCursorRowCol(${this.cursorPos})`)
      //throw new Error("gcrSLOW")
    }
    */
    // we want to find the row/col in this.lines corresponding to
    // the character at position pos-this.viewStart, so we update pos
    pos = pos - this.viewStart
    let charsToGo = pos

    // loop through this.lines
    // if the pos is not on the line, then
    // subtract the line length+1 from charsToGo
    // if the pos is on the line, then return the row/col
    // if the position is a the beginning of a line, then
    // we will eventually get charsToGo==0 otherwise
    // charsToGo is always >0
    let row=0
    while(charsToGo>=0){

      if (row >= this.lines.length) {
        throw new Error(`gvrcF(${pos}) vs=${JSON.stringify(this.lines,null,2)}`)
      }
      //console.log(`charsToGo=${charsToGo} row=${row} line=${this.lines[row]}`)
      //console.log(JSON.stringify([row,charsToGo,this.lines[row]],null,2))
      const line = this.lines[row]
      if (charsToGo > line.length) {
        charsToGo -= line.length+1
        row++
      } else {
        const col = charsToGo
        return [row,col]
      }
    }
    //console.log(`in getVisRowCallFast(${pos}) row=${row} charsToGo=${charsToGo} ERROR?? `)
    return [row,0]
    /*
    let lines = this.lines
    let p=0
    let prevOffset=0
    let row = 0

    while (p <= pos && row<lines.length){
      //console.log(`p=${p} prev=${prevOffset} row=${row}`)
      prevOffset = p
      p+= lines[row].length+1
      row += 1
    }
    //console.log(`p=${p} prev=${prevOffset} row=${row}`)
    if (row==lines.length){
      //console.log('lastline')
      return [row-1,pos-prevOffset] // this shouldn't happen!!
    }

    let cursorRow = row-1
    let cursorCol = pos - prevOffset
    //console.log(`=> ${cursorRow} ${cursorCol}`)
    return [cursorRow,cursorCol]
    */
  }

/*
  getCursorRowColSLOW(){
    return this.getRowColSLOW(this.cursorPos)
  }
*/
/*
  getRowColSLOW(pos){
    console.log(`grcSLOW(${pos})`)
    alert("We shouldn't be calling this!!")
    // this returns the row and col for a general cursorPos
    if (pos < 0 || pos > this.docSize){
      //console.log(`ERROR: in getCursorRowCol(${this.cursorPos})`)
      throw new Error("gcrSLOW")
    }
    let lines = this.ddll_lines()
    let p=0
    let prevOffset=0
    let row = 0

    while (p <= pos && row<lines.length){
      prevOffset = p
      p+= lines[row].length+1
      row += 1
    }
    if (row>lines.length){
      //at end of last line with a CR
      row++
      prevOffset=p
    }
    let cursorRow = row-1
    let cursorCol = pos - prevOffset
    let cursor = [cursorRow-this.rowOffset,cursorCol]
    console.log(`=>${JSON.stringify(cursor,null,2)}`)
    return cursor
  }
  */

/*
  lastviewStart(){
    //console.log(`lastviewStart`)
    let pos = this.viewStart
    for (let line of this.lines) {
      pos += line.length + 1
    }
    //console.log("="+pos)
    return pos -1
  }
  */

/*
  updateLinesAroundCursorPosSLOW(){ //  SLOW
    // this will set the cursor pos to the first line of the window
    //console.log("updateLinesAroundCursorPos")
    this.printState()

    let allLines = this.ddll_lines()
    if (this.viewStart <= this.cursorPos && this.cursorPos<=this.viewEnd){
      this.reloadLinesFAST()
      return
    }
    //console.log("find the new rowOffset")
    let p=0
    let lastp=0
    let i=0
    while (p <= this.cursorPos && i < allLines.length) {
      lastp = p
      p += allLines[i].length+1
      i=i+1
    }
    //console.log(`p=${p}  lastp=${lastp} i=${i}`)
    let cursorRowOffset = lastp
    let cursorRow = i-1
    let cursorCol = this.cursorPos - cursorRowOffset
    this.cursor = [cursorRow,cursorCol]
    this.rowOffset = cursorRow
    this.viewStart = cursorRowOffset
    this.reloadLinesFAST()
  }
*/

/*
  reloadLinesSLOW(){  // SLOW
    //console.log("in reloadLinesSLOW")
    let allLines = this.ddll_lines()
    this.lines = allLines.slice(this.rowOffset,this.rowOffset+this.rows)
    //console.log(`realoadLines() => ${JSON.stringify(this.lines,null,2)}`)
  }

  getReloadLinesSLOW(){
    return this.ddll_lines().slice(this.rowOffset,this.rowOffset+this.rows)
  }
  */

  //TJH 8/2/2021
  // We probably don't have to call this unless you move the cursor to
  // a complete different place in the string by scrolling the window ...

  reloadLinesFAST(){
    // this uses this.viewStart and this.viewEnd to
    // recreate the this.lines array
    // it doesn't return a value
    let startPos = this.viewStart
    let endPos = this.viewEnd
    //console.log(`reloadLinesFAST(${startPos},${endPos})`)
    //console.log(JSON.stringify(this.ddll_lines(),null,2))
    //this.printState()

    // first we handle a special case where the document is empty, or the view is about to become empty
    if (this.docSize==0 || startPos == endPos){
      this.lines = [""]
      return
    }

    // now we know the document is non-empty
    // we will use the ddll "nth" function to pull out the characters
    // one at a time and form them into strings for each row
    // it is a little more complex (and efficient) as nth return a node
    // containing an array of consecutive visible characters!


    let lines =[]
    let line=""
    let p = startPos

    while (p<endPos){
      //console.log(`accessing nth(${p})`)
      // grab the listNode containing position p
      const listNode = this.ddll.msetTree.strings.nth(p,'std')
      // get the position of the first character in the listNode
      const eltsBeforeNode = listNode.indexOf("std")
      // get the data element of the listNode (not the next and prev links)
      const subNode = listNode.data
      // get the actual array of characters for that node
      const userData = subNode.userData()
      // get index, pos, of the element at position p in the userData array
      const pos = p-eltsBeforeNode
      //const char = userData[pos]

      //const first = subNode.first
      //const offset = (p - eltsBeforeNode + subNode.first)
      //console.log(JSON.stringify([p,userData,first,offset,pos,char]))

      // we have the first character, but now we need to process the rest
      // of the characters in the subNode until p==endPos or
      // we have reached the end of the userData

      //TJH 8/2/2021  we can optimize this by using slices of the
      // userData array instead of iterating one character at a time ..
      for (let q=pos; q<userData.length; q++){
        // get the character
        let c = userData[q]

        if (c=='\n'){
          // handle newlines by adding the current line to the end of lines
          lines = lines.concat(line)
          line=""
        } else {
          // otherwise add the character to the end of the line
          line += c
        }
        p++
        // when the endPos is eventually reached,
        // add the last line to end of this.lines
        // and set this.lines to be this array and return
        if (p==endPos){

          this.lines = lines.concat(line)
          //this.printState()
          return
        }
      }
    }
/*
    //console.log("before:" +JSON.stringify(this.lines,null,2))
    lines = lines.concat(line)
    line=[]
    lines = lines.slice(0,this.rows)
    //console.log("after:" +JSON.stringify(this.lines,null,2))
    this.lines=lines
    return this.lines
    */
  }

  getNthElement(p){
    // we assume that p is a valid position in the document
    //console.log(`getNthElement(${p})`)
    if (p<0 || p>this.docSize){
      throw new Error(`getNthElement(${p}) out of range [0,${this.docSize}]`)
    }

    //console.log(`getNthElement(${p})`)
    const listNode = this.ddll.msetTree.strings.nth(p,'std')
    const eltsBeforeNode = listNode.indexOf("std")
    const subNode = listNode.data
    const userData = subNode.userData()
    //const first = subNode.first
    //const offset = (p - eltsBeforeNode + subNode.first)
    const pos = p-eltsBeforeNode
    const char = userData[pos]
    //console.log(`==> ${JSON.stringify(char,null,2)}`)
    return char
  }



  // we can optimize this since the subnodes contain an array
  // of values and we shouldn't have to make so many calls to the ddll object
  getLineContainingPosFAST(pos){
    // this returns a list [line,startPos,endPos]
    // where line is the string containing the specified position
    // if the character at the pos is a newline '\n'
    // then the line is all the characters between that newline and
    // the next one earlier in the file....

    // first we handel the case of an empty document
    // the line here is the empty string by convention
    if (this.docSize==0) {
      return ["",0,0]
    }

    // next we make sure that pos is in range and throw an error otherwise
    if (pos > this.docSize || pos<0){
      throw new Error(`getLineContainingPosFAST(${pos}) out of range [0,${this.docSize}]`)
    }

    let line=""
    // first we can toward the front of the array from the given pos
    // looking for a CR or the beginning of the array
    // we put all of those chars into a string
    let p=pos-1
    while (p>=0){
      let c = this.getNthElement(p)
      //console.log(`pos=${pos} p=${p} c=${c} line="${line}"`)
      if (c=='\n'){
        break;
      } else {
        line = c+line
        p=p-1
      }
    }
    //console.log(`after loop p=${p}`)
    // the loop above stops when p=-1 or when the character at pos p is CR
    // in either case the beginning of the line is a position p+1
    const lineStart = p+1
    //console.log(`lineStart=${lineStart}`)

    // then we can forward looking for a CR or the end of the document
    // add add those elements to the end of the line
    let q = pos
    while(q<this.docSize){
      let c = this.getNthElement(q)
      //console.log(`q=${q} c=${c} `)
      if (c=='\n'){
        // this is the end of the line
        break
      } else {
        line = line + c
        q=q+1
      }
    }
    //console.log(`after q loop q=${q}`)
    // the loop above terminates when q==this.docSize or
    // when the character at position q is a newline
    // in either case the end of the line is position q
    const lineEnd = q
    return [line,lineStart,lineEnd]

/*
    //
    let char=""
    let line=[]

    if (pos==this.docSize){
      // this is the case where we are looking for the line at the end of the document
      // it is a little tricky because the document could end with a newline
      // and the line containing the last position (after the newline)
      // is therefore empty
      let char0 = this.getNthElement(pos-1)
      if (char0=="\n") {
        return ["",pos,pos]
      }
      // if the last character is not a newline
      // then the document does not end with a CR
      // so we will scan to the left until we get a CR or pos
    } else {
      char = this.getNthElement(pos)
      if (char=='\n'){
        return ["",pos,pos]
      }
      line = [char]
    }


    // get all characters on the line before p
    let p = pos-1
    if (p > 0) {
      char = this.getNthElement(p)
      while (char != '\n' && p>0){
        line = [char]+line
        p = p-1
        char = this.getNthElement(p)
      }
    }

    let startPos=p+1
    if (p==0) {
      startPos=0
      line = [char]+line
    }
    // get all characters on the line after p
    p = pos+1
    if (p<this.docSize){
      char = this.getNthElement(p)
      while (char != '\n' && p<this.docSize){
        line = line + [char]
        p = p+1
        char = this.getNthElement(p)
      }
    }
    let endPos=p-1
    if (false && p==this.docSize){
      endPos=p
      line = line + [char]
    }

    return [line,startPos,endPos]
*/
  }



/*
  centerView(){
    // first we make sure the row containing the cursor is visible
    if (this.cursorPos < this.viewStart ||
        this.cursorPos > this.lastviewStart()) {
      this.updateLinesAroundCursorPosSLOW()
    }
    this.cursor = this.getCursorRowCol()
    if (this.cursor[1]<this.colOffset) {
      this.colOffset = Math.max(0,this.cursor[1]-this.scrollOffset)
    } else if (this.cursor[1]>=this.colOffset+this.cols){
      this.colOffset = Math.max(0,this.cursor[1]-this.scEzrollOffset)
    }
  }
*/

  doInsertionLogic(char, pos, isMe){
    // take note of what column and row we're in, so we can insert the new character
    const [row, col] = this.getVisRowColFAST(pos)

    // next we update the viewStart and viewEnd as needed
    // and potentially this.lines .....
    if (char != '\n') {
      // if the character is not a newline
      // it just increases the viewEnd
      this.viewEnd += 1

      // insert the character at the proper row and column
      this.lines[row] = this.lines[row].slice(0, col) + char + this.lines[row].slice(col)

    } else {
      const split1 = this.lines[row].slice(0, col)
      const split2 = this.lines[row].slice(col)

      if (this.lines.length < this.rows) {
        // if the character is a newline, but this.lines isn't full
        // we don't have to remove any lines from this.lines
        this.viewEnd += 1

        // split the line at the specified row/col and splice in the two new lines
        this.lines[row] = split2
        this.lines.splice(row, 0, split1)

      } else {
        if(isMe) {
          // this is our own operation
          // char=='\n' and this.lines.length == this.rows
          // in this case we need to decrease this.viewEnd since a new row
          // has been added and it will push off the last row
          const lastLine = this.lines[this.rows - 1]
          if (this.cursorPos < this.viewEnd - lastLine.length) { // not last line
            // this is the case that the CR just pushes the last line off the screen
            // and so the viewEnd moves past each character on the last line
            // and the CR at the end of the second to the last line
            // but we also added a CR earlier so we just subtract lastLine.length
            this.viewEnd -= lastLine.length

            this.lines.pop()
            this.lines[row] = split2
            this.lines.splice(row, 0, split1)

          } else { //last line
            // in this case, the user is inserting a CR on the last line in the
            // viewing window and we will need to split the last line into two
            // and remove the first line so that the cursor stays in the view
            this.viewEnd += 1  // account for the new CR
            this.viewStart += this.lines[0].length + 1

            this.lines[row] = split1
            this.lines.shift()
            this.lines.push(split2)
          }
        } else {
          // another user is inserting something on our screen
          if(pos <= this.cursorPos){
            // move all on-screen characters before the other user's cursor up by one line
            this.cursorPos++
            this.viewEnd++

            // if the other user's cursor is on the first line of this.lines, viewStart moves
            // past the characters before the other user's cursor, plus the newline that the other user just inserted.
            // if the other user's cursor is not on the first line, viewStart moves past the entire first line, plus
            // the newline at the end of the first line.
            this.viewStart++ // account for the newline
            if(row === 0) {
              this.viewStart += split1.length
            } else {
              this.viewStart += this.lines[0].length
            }

            this.lines[row] = split2
            this.lines.splice(row, 0, split1)
            this.lines.shift()
          } else if(pos < this.viewEnd) {
            // move all on-screen characters after the other user's cursor down by one line
            if(row === this.lines.length - 1) {
              this.viewEnd -= split2.length
            } else {
              // the viewEnd moves past each character on the last line
              // and the CR at the end of the second to the last line
              // but we also added a CR earlier so we just subtract lastLine.length
              this.viewEnd -= this.lines[this.lines.length - 1].length
            }

            this.lines[row] = split2
            this.lines.splice(row, 0, split1)
            this.lines.pop()
          }
        }
      }
    }
  }

  insertCharAtCursorPos(char) {
    // this adjusts the view based on which character we insert
    // inserting a newline character can change the viewEnd
    // and the cursor always changes.
    //console.log(`insertCharAtCursorPos(${JSON.stringify(char,null,2)})`)
    //this.printOffsetData()

    // first we insert the character into the underlying ddll tree
    // this will also send the operation to all collaborators
    this.ddll.msetTree.insert(this.cursorPos, char)

    // this increases the document size
    this.docSize += 1

    this.doInsertionLogic(char, this.cursorPos, true)

    // finally we adjust the cursor position..
    this.moveCursorRight()
  }

  removeCharBeforeCursorPos(){
    //console.log('rCBCP')
    //this.printOffsetData()

    // we can't remove any characters before position 0 so just return
    // this happens when the user presses backspace at position 0
    if (this.cursorPos==0){
      return
    }

    // let's first get the character to be removed
    // if it is a CR it could change the viewing window
    let char = this.getNthElement(this.cursorPos-1)
    //console.log("before:\n"+JSON.stringify(this.ddll_lines(),null,2))

    // here we do the deletion and send the editOp to all collaborators
    this.ddll.msetTree.delete(this.cursorPos-1)
    //console.log("after:\n"+JSON.stringify(this.ddll_lines(),null,2))

    // the document size is one smaller
    this.docSize-=1

    // the cursor position is one smaller also
    this.cursorPos -= 1

    //this.viewEnd -= 1
    //this.printOffsetData()

    if (this.cursorPos < this.viewStart){
      // this happens if the user was at the beginning of the first line of the view
      // and deleted the previous character by hitting backspace
      // the cursor is now at the end of what was the previous line
      // we have deleted the CR between the lines ...
      // and so that previous line now becomes visible
      //console.log("We are pulling in a new line!")
      const [line,startPos,endPos]
          = this.getLineContainingPosFAST(this.cursorPos)

      // we need to adjust the column offset as the cursor is now
      // at the end of the first line in the view
      this.colOffset = Math.max(0,line.length-this.cols+1)

      // the beginning of this new line is the new beginning of our view
      this.viewStart = startPos
      // due to the deletion, the last character visible on screen now has an index of one less
      this.viewEnd -= 1;

      this.lines[0] = line
      // note that we have simply lengthened the first line of this.lines
      // so we don't need to remove any elements from the end!
      //this.printOffsetData()
    } else if (char=='\n'){
      // this is the case where we are deleting a CR between two lines which
      // are in this.lines. They will then be merged and we need to
      // pull in another line either at the end if possible
      // and adjust viewEnd accordingly
      const [row,col] = this.getVisRowColFAST(this.cursorPos)

      // The cursor was at the beginning of this.lines[row+1] before the delete was performed.
      // After the delete, the cursor has moved up to this.lines[row]. So this.lines[row+1] must be merged onto the
      // end of this.lines[row], the original this.lines[row+1] deleted, and all subsequent lines shifted up one
      // position to fill the space.
      this.lines[row] += this.lines[row + 1]
      this.lines.splice(row + 1, 1)

      // adjust column offset if necessary
      if (col > this.colOffset+this.cols || col < this.colOffset) {
        this.colOffset = Math.max(0, col - this.cols)
      }

      if (this.viewEnd < this.docSize){
        // pull in another line into the buffer and adjust viewEnd
        const [lastline,startP,endP]
            = this.getLineContainingPosFAST(this.viewEnd+1)

        this.lines.push(lastline)
        this.viewEnd = endP
      } else {
        this.viewEnd -= 1
      }
      //this.printOffsetData()
    } else {
      // this is the case where we delete a non-CR element in the view
      // it removes the deleted element from the current line in the view, and decrements viewEnd
      const [row,col] = this.getVisRowColFAST(this.cursorPos)
      this.lines[row] = this.lines[row].slice(0, col) + this.lines[row].slice(col + 1)
      this.viewEnd -= 1
    }
    //console.log("before rlFast")
    //this.printState()
    //this.reloadLinesFAST()
    //console.log("after_rlF_returning from rCBCP")
    //this.printState()
  }

  setRedrawCanvas(redraw){
    this.redrawCanvas = redraw
  }


  redraw(){
    this.redrawCanvas()
  }

  setRowsCols(rows,cols){
    this.rows = rows
    this.cols = cols
    //this.view.setRowsCols(rows,cols)
  }


}
