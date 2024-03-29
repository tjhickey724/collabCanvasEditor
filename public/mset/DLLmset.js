export {DLLmset}
import {DLLwi} from "./DLLwi.js"
import {BSTwi} from "./BSTwi.js"

/* ***********************************************************************
 * CORE MSET Demo Implementation in JavaScript
 *
 * This is an implementation of lists with insertion and deletion
 * which is fully distributive and in which all operations can be performed
 * in time O(log(n)) where n is the total number of operations applied to
 * the list so far. This is asymptotically optimal.
 *
 * This version uses "Subnodes" instead of single object Elements in the
 * underlying DLL, because of this it has the same efficiency as an array
 * initially and degrades by O(log(k)) where k is the number of insertions
 * and deletions performed on the DLL. It can be initialized with an array
 * of any size containing any kind of javascript objects!
 *
 * The main applications this was built for was
 *  -- a collaborative text editor
 * but we also have a demo of a collaborative JSON list editor
 * which allows any number of people to insert and remove JSON elements
 * from a shared list.
 *
 * The DLLmset class has four main methods
 *  insert(pos,element)
 *  delete(pos)
 *  nth(pos)  -- return the nth element in the
 *  copy() -- return a copy of the DLL backed by a single array
 *            this is a kind of garbage collection...
 *
 * This can be used by a single user, or by multiple users on multiple computers
 * or in multiple threads. To use it with multiple users you need the MSET class
 * It also receives remote operations from the network and applies it to the tree
 * It requires a Network object and a Socket object,
 * which afre passed in when the tree is created...
 *
 */


class DLLmset{
  constructor(u,network,elements){
    elements = elements || []
    this.user = u;
    this.count = 0;

    // these are needed for garbage collection
    this.netOps = [] // stack of EditOp objects used for garbage collection
    this.localOps = []
    this.inTransitOps = []
    this.gcMode = false //


    this.root = new Node(0,0,elements);

    this.strings = new DLLwi(Element.sizefn);
    this.nodes = {};
    this.nodes[[0,0]] = this.root;
    this.opqueue = [];  // dequeue of ops that haven't been applied
    this.waitqueue={};  // hashtable from targets to list of ops
    this.emptyNetwork = {hide:(x)=>null,insert:(x)=>null,extend:(x)=>null}
    this.network = network || this.emptyNetwork

    this.insertCallback = function(k,elt,user){return;}
    this.deleteCallback = function(k,elt,user){return;}


    // the rest of this constructor initializes the
    // instance variables defined above ...
    // We add the three elements to the main DLL list
    const start = this.root.start
    const elts = this.root.subnodes.first.next.data
    const end = this.root.end
    start.listNode = this.strings.first.insertAfter(start)
    elts.listNode = start.listNode.insertAfter(elts)
    elts.listSubnode = this.root.subnodes.first.next
    end.listNode = elts.listNode.insertAfter(end)

    this.root.isRoot=true


  }



  treeHeight(){
    return this.strings.tln.height
  }

  size(feature){
    feature = feature || 'std'
    return this.strings.tln.sublistSize[feature]
  }

  gcWait(){
    this.network.gcWait()

  }

  copy(){
    const elts = this.toList3('std')
    //console.log("in copy: elts="+JSON.stringify(elts))
    let eltArray = []
    //elts.forEach(function(e){eltArray= eltArray.concat(e.treeNode.elts.slice(e.first,e.first+e.size))})
    //console.dir(elts)
    const newMSET = new DLLmset(this.user,this.network,elts)//Array)
    //const oldSize = this.size('edit')-this.size('rev')
    //const newSize = newMSET.size('edit')-newMSET.size('rev')
    //if (newSize>10) throw new Error("???")


    newMSET.insertCallback = this.insertCallback
    newMSET.deleteCallback = this.deleteCallback

    //console.log(`oldSize=${oldSize} newSize=${newSize}`)


    //console.log(this.toString(' ','std'))
    //console.log(newMSET.toString(' ','std'))
    //console.log(newMSET.root.toStringIndent(5))
    //console.log(newMSET.toList2())

    //newMSET.insertAll(elts) // have to write insertALL

    return newMSET
  }

  toList2(feature){
    feature = feature || 'std'
    let z =  this.strings.toList(feature)
    let result=[]
    for(let i=0; i<z.length;i++){
      result=result.concat(z[i].toList())
    }
    return result
  }





  toString(separator,feature){
    separator = separator || ''
    return this.strings.toString(separator,feature)
  }

  nth(n,feature){
    return this.strings.nth(n,'std').data.userData()
  }

  toListOLD(feature){
    feature = feature || 'std'
    /*
      I need to rewrite this using iteration as it exhausts the runtime stack
      it must be using recursive calls....
    */
    return [].concat.apply([],
        (this.toListInternal(feature).map((x)=>((x.vis||x.marker)?x.userData():'['+x.userData()+']'))))
  }

  toListTest(feature){
    let z = this.strings.toList(feature)
    let result=[]
    for(let i=0;i<z.length;i++){
      if (z[i].vis) {
        result.concat(z[i].toList())
      } else if (z[i].marker){
        result.push(z[i].userData())
      } else {
        result.push(z[i].toList().map((x)=>([x])))
      }
    }
    return result
  }

  toList(feature){
    let z = this.strings.toList(feature)
    let result=[]
    for(let i=0;i<z.length;i++){
      if (z[i].vis||z[i].marker){
        result.push(""+z[i].userData())
      } else {
        result.push("["+z[i].userData()+"]")
      }
    }
    return result
  }

  toList3(feature){
    feature = feature || 'std'
    let z =  this.strings.toList(feature)
    let result=[]
    for(let i=0; i<z.length;i++){
      result=result.concat(z[i].toList())
    }
    return result
  }

  toListInternal(feature){
    return this.strings.toList(feature)
  }
    /*
     * This method takes a tree op from the queue, checks to see if it can be applied
     * If its target is not there, it adds it to a wait queue on that target
     * If the target is in the tree, it applies to tree op, which generates a new node n
     * and the editops waiting on n are then added to the opqueue. It returns true if an operator
     * was processed, false otherwise.
     *
     * This method will only be necessary when not using a central server
     * because the central server serializes all of the calls. In this model,
     * when we get an op from the network we just enqueue it and then
     * periodically call processNetOp to handle those ops...
     */


  processRemoteOp(op){
      this.opqueue.push(op)

      //console.log(`processRemoteOp(${op}  opqueue=\n${JSON.stringify(this.opqueue)})`)
      //console.dir(op)
      while (this.opqueue.length > 0) {
        var op=this.opqueue.shift(); // take from the head of the queue!
        var target=this.nodes[op.nodeid]; // make sure the target is in the tree
        //console.log('processNetOp '+JSON.stringify(op)+' target'+target)
        //console.dir(target)
        //console.log('user '+this.user+ ' processing remote op '+JSON.stringify(op))
/*
        if ( ((op.op == 'insert') &&  (op.un[0]==this.user))
             ||
             ((op.op == 'extend') && (op.nodeid[0]==this.user))
             ||
             ((op.op == 'delete') && (op.nodeid[0] == this.user)) ){
          // this tests to see if this.user owns this operation
          // this is needed for garbage collection
          // we are keeping track of the intransit operations
          //console.log('in transit length is '+this.inTransitOps.length)
          console.dir(this.inTransitOps)
          const popop = this.inTransitOps.splice(0,1)
          console.dir([popop,op])
          console.log('popped inTransit for '+this.user)
          console.log(JSON.stringify(op))
          if (popop.length>0)
            console.log(JSON.stringify(popop[0].treeOp))

        }
*/
        if ((target===undefined)
             ||
             ((op.op=='insert') && (op.q > target.elts.length))
             ||
             ((op.op=='extend') && (op.q > target.elts.length))
             ||
             ((op.op=='delete') && (op.q >= target.elts.length))
           ){  // if not, then push onto the wait queue
             //console.log(`PUSHING INTO WAIT QUEUE`+JSON.stringify(op))
             if (target==undefined){
               //console.log('opqueue -- waiting for the node '+JSON.stringify(op.nodeid))
             } else {
               //console.log(`waiting for node ${op.nodeid.user}:${op.nodeid.count} to be > ${op.q}`+` currently at ${target.elts.length}`)
             }
             //console.dir({target:target,op:op})
            this.waitqueue[op.nodeid] = this.waitqueue[op.nodeid] || []; // make waitqueue empty if undefined
            this.waitqueue[op.nodeid].push(op);
            //console.log('waitqueue:\n'+JSON.stringify(this.waitqueue))
        }else {                    // if so, then apply, and enqueue ops waiting for the created result
            //console.log('opqueue -- NOT waiting '+JSON.stringify(op))
            //console.log(`processing ${JSON.stringify(op)} of length ${target.elts.length}`)
            var result = this.applyTreeOp(op); // returns new node it creates or extends
            //console.dir(result)
            //console.dir(target)
            if (op.op=='delete'){ // hiding doesn't add new nodes
              return
            } else {
              let nodeid = [result.user,result.count]
              //console.log('generating '+JSON.stringify(nodeid))
              var waiting = this.waitqueue[nodeid];
              delete this.waitqueue[nodeid]
              //console.log('waitqueue:\n'+JSON.stringify(this.waitqueue))
              if ((waiting !==undefined) && (waiting !== null)) {  // if something is waiting, add it to front of the opqueue
                  //console.log(`target ${result.user}:${result.count}/${result.elts.length} was found!`)
                  //console.log(`adding ${JSON.stringify(waiting)} to opqueue to get`)
                  this.opqueue = waiting.concat(this.opqueue);
                  //console.log('enqueueing ops:\n'+JSON.stringify(this.opqueue))
              }
            }

        }
      }
  }


  enqueue(op) {
    this.opqueue.push(op);
  }


    /* this method take a tree edit operation object
     which it obtains from the network and applies it to the tree
     returning the result. We assume that the target is in the tree!
     in this case the insert and extend can insert a list of characters
     we should also modify delete to delete a set of characters ..
    */
  applyTreeOp(treeOp){
      var n;
      if (treeOp.op == "insert") {
          n = this.treeinsert(treeOp.nodeid, treeOp.q, treeOp.un, treeOp.c);
      } else if (treeOp.op == "extend") {
          n = this.treeextend(treeOp.nodeid, treeOp.q, treeOp.c);
      } else if (treeOp.op == "delete") {
          n = this.treehide(treeOp.nodeid, treeOp.q, treeOp.u, treeOp.size);
      }
      return n; // this has yet to be written ...
  }

  /* **************************************
   *  MSET DATA TYPE OPERATIONS
   */

  /* treeinsert(M,vm,q,un,c)
   *  this inserts the new node with id un and which contains c
   *  into the node with id vm at offset q
   *  and it updates M to reflect this change ...
   */

  treeinsert(vm,q,un,c){

      //console.log('in treeinsert:'+JSON.stringify([vm,q,un,c]))
      //console.dir(this)
      //console.log(this.strings.tln.toStringIndent(5))
      const n = this.nodes[vm] // O(1) with a hashtable Implementation
      let s= null
      if (n.isRoot&&q==0){ //}(q==0)&&(n.elts.length==0)){
        // this is the case where we are the first to insert in the top of the tree
        // which is owned by the superuser 0
        // we just insert directly into the iset of the node
        s = n.subnodes.first.next // get the first subnode
      } else if ((q==n.elts.length) && (q>0)) {
        // we are inserting at the end of a node we don't own (else it would be tree extend)
        // we will make a new subnode and insert at the beginning of that
          s = n.subnodes.nth(q-1,'edit')  // this returns a listNode, we may want elements instead
          //console.log(`in tricky case s.data.size=${s.data.size} s.data.userData='${s.data.userData}'`)
          //console.dir([n,s])
          if (s.data.size>0){
            if (s.next.data=="endmarker"){
              //we need to split this node and add an empty after it!
              // otherwise we'll just insert in the iset of this node ...
              let inNodeOffset = q-s.indexOf('edit')
              let e = s.data.split(inNodeOffset)
              e.right.vis = true //the new subnode could be extended by another client
              s = e.right.listSubnode
            } else {
              s = s.next
            }
          }


      } else {
          //console.dir([n,q])
          //console.log(n.subnodes.toString(' ','count'))

          s = n.subnodes.nth(q,'edit') // return subnode containing offset q
          //console.log('looking up subnode containing the qth element')
          //console.dir(s)
      }
      //console.dir([s,q,s.indexOf('std')])

      const s_offset = q - s.indexOf('edit')
      const s_size = s.data.size;
      //console.log(JSON.stringify([s_offset,s_size]))


      // in this conditional, we create the node m = (un,c)
      // and find insert it into the appropriate iset
      // after the conditional we see the node m in where we sew it in after
      let m = DLLmset.createCharNode(un,c);  // O(1)
      //console.log("***** m=")
      //console.dir(m)
      let f=null
      let k=null

      if (s_offset==0){
        // then we need to insert in the InsertionSet at the left of this node
        // and we may need to create it
        if (!s.data.iset){
          s.data.iset = new InsertionSet()
          //console.log("creating new iset")
        }
        k = s.data.iset.insertNode(m)
        //console.log("k= "+k)
        if (k>0){

          f = s.data.iset.get(k-1).end.listNode
          //console.log('f is end of previous iset entry')
          //console.dir(f)
        } else if (q==0) {
              // here the node is inserted at pos q=0 in the parent node
              f=n.start.listNode;
              //console.log('f is start of the whole dll')
              //console.dir(f)
        } else { // q>0
              // if the node is not inserted at the beginning of the parent node
              // so there is a subnode that preceeds it
              f=n.subnodes.nth(q-1,'rev');
              f=f.data.listNode
              //console.log('f is the previous subnode')
              //console.dir(f)
        }
      } else { // (s_offset <= s_size){
        // we are inserting in the middle of the subnode and need to split it
        //console.dir(s)
        let st = s.data.split(s_offset) // split subnode s and return the right half
        //console.dir(['after split',st,this])
        k = st.right.iset.insertNode(m)  // get its empty iset (which is created by split)
        //console.log("just inserted the right half of split node:")
        //console.dir(st)
        f = st.left.listNode // sew it in after the subnode on the left (which remains s)
        //console.log('f is left half of the split subnode')
        //console.dir(f)

      }


      // next we insert the three new elements into the main list
      //console.dir(f)
      //console.log(this.strings.tln.toStringIndent(5))


      const node1 = f.insertAfter(m.start);
      m.start.listNode=node1
      //console.dir(m.start)
      //console.log('**** just inserted start symbol <6:0 '+this.strings.tln.toStringIndent(5))
      //console.dir([this,node1,m,f])

      const node2 = node1.insertAfter(m.subnodes.first.next.data);
      m.subnodes.first.next.data.listNode = node2
      const node3 = node2.insertAfter(m.end); // O(log(N))
      m.end.listNode = node3
      //console.dir(m)
      //console.log(this.strings.tln.toStringIndent(5))
      // and insert the new node into the hashtable
      this.nodes[un]=m; // add the new node to the hash table
      const insertPos = node2.indexOf("std")
      this.insertCallback(insertPos,c,un[0]) // ILL HAVE TO CHECK WHAT INDEXOF RETURNS
      //this.netOps.push(new EditOp(this).treeinsert(vm,q,un,c,insertPos))
      //console.log("AFTER INSERT "+this.strings.toString(' ','count'))
      //console.log(this.strings.tln.toStringIndent(5))
      return m;


  }


  /* treeextend(M,nodeid,c)
   *  this inserts the character c at the end of the node with the specified nodeid
   *  and it updates M to reflect this change ...
   */
  treeextend(nodeid,q,c){

      //console.log("inside treeextend: "+JSON.stringify([nodeid,c]))
      //console.dir(this)
      var n = this.nodes[nodeid];
      //console.dir(n)
      //console.dir(c)
      if (n.elts.length != q){
        console.log(JSON.stringify([nodeid,q,c,n.elts.length]))
        //console.dir([n,this])
        throw new Error("error in treeextend, not inserting at end of list")
      }
      n.elts = n.elts.concat(c)
      //console.dir(['te1',n])
      const f = n.end;



      //console.dir(f)
      const insertionPos = f.listNode.indexOf('std')
      var g = f.listNode.prev.data; // this is the previous subnode, which we will extend!
      if (!g.vis) {
        // we need to split g to insert a new node to insert in...
        let e = g.split(g.size)
        //console.dir([g,e,g.size])
        //console.log('in treeextend')
        e.right.vis = true
        g=e.right
      }

      //console.log('updating g')
      //console.dir(g)
      g.size = g.size+c.length
      g.listNode.elementSize = {std:g.size,rev:g.size,edit:g.size,count:g.size}
      g.listSubnode.elementSize = g.listNode.elementSize
      g.userData = () => g.treeNode.elts.slice(g.first,g.first+g.size)
      //console.log(JSON.stringify([g.size,c.length,g.listNode.size,g.userData]))
      //f.listNode.prev.data = g // this should update the weights!!
      //console.log('updating g.listNode in treeExtend')
      g.listNode.tln.updateWeights()
      //console.log('updating g.listSubnode in treeExtend')
      //console.dir(g)
      g.listSubnode.tln.updateWeights()
      // I need to update the listnode in the AVL tree
      //console.log('at the end of treeextend')
      //console.dir(g)
      //console.log(g.listNode.dll.tln.toStringIndent(5))
      this.insertCallback(insertionPos,c,n.user)
      //this.netOps.push(new EditOp(this).treeextend(nodeid,q,c,insertionPos))
      return n;
  }


  /* treehide(M,nodeid,q)
   *  this hides the character c with offset q in the node with the specified nodeid
   *  and it updates M to reflect this change ...
   */
  treehide(nodeid,q,u) {

      const n = this.nodes[nodeid] // O(log(N))
      //console.log("in treehide "+JSON.stringify([nodeid,q,u]))
      //console.dir([n,this])
      //console.log(n.subnodes.tln.toStringIndent(5))
      //console.dir(n.subnodes.toList('rev'))
      const subNodePosition = n.subnodes.nth(q,"rev")
      //console.dir(subNodePosition)

      const subNode = subNodePosition.data
      const offset = q-subNode.first
      const size = subNode.size
      const deletionPosition = subNodePosition.data.listNode.indexOf("std")+offset
      const deletionElement = n.elts[q]
      //console.log('delete: '+deletionPosition+" "+deletionElement)
      subNode.deletedBy = u

      if (offset==0){
        if (subNode.size==1){
          //console.log('treehide case 1')
          // the entire subnode will be hidden, so set the vis flag and
          // rebalance the listNode and listSubnode to change the weights in ancesters
          subNode.hide()
        } else {
          //console.log('treehide case 2')
          // the deleted object is the first in a node with >=2 elements
          // split the subnode after element 0
          // remove the old node from both lists and add the new nodes
          const nodes = subNode.split(1)
          nodes.left.hide()
        }
      } else if (offset==size-1) {
        //console.log('treehide case 3')
        // the deleted object is the last element of the node
        // split right before it, remove old node, insert two new nodes
        const nodes = subNode.split(size-1)
        nodes.right.hide()
      } else {
        //console.log('treehide case 4')
        // the deleted objects has elements before and after it in the subnode
        // so we need to split the subnode into three parts, hide the middle one
        // remove the old node and insert the two new nodes
        //console.dir(subNode)
        //const nodes = subNode.split(q)
        const nodes = subNode.split(offset)
        const left = nodes.left
        const nodes2 = nodes.right.split(1)
        const middle = nodes2.left
        const right = nodes2.right
        middle.hide()
      }

      this.deleteCallback(deletionPosition,deletionElement,u)
      //this.netOps.push(new EditOp(this).treehide(nodeid,q,u,deletionPosition,deletionElement))
      return n;
  }


  /* Create a node to in inserted in the mset tree given the nodeid and the character
   * this requires creating the 3 corresponding elements and settingup the node.
   */
  static createCharNode(nodeid,c){
      var n = new Node(nodeid[0],nodeid[1],c);
      return n;
  }

  nextNonMarker(listnode){
    // we can assume that listnode is a marker cell
    // and we should return the index of the next nonmarker in the string....
    const index = listnode.indexOf("rev")
    const result= this.strings.nth(index,"rev")
    return result
  }





  /********************************************************
   * List Operations
   * Here is where we convert string operations (insert, delete) into tree ops
   * following the algorithm in the paper
   */

  /**
    For now we implemention delete a single element at a time.
    Later we will add deletion of a range of elements (which will be more efficient!)
  */

  processLocalOp(op){
    //this.inTransitOps.push(op)
  }


  delete(k) {

      const listNode = this.strings.nth(k,"std") // find the subnode containing kth element
      const eltsBeforeNode = listNode.indexOf("std")
      const subNode = listNode.data
      const nodeid = subNode.nodeid
      const offset = (k - eltsBeforeNode + subNode.first)
      //console.log("in delete "+k)
      //console.dir([listNode,eltsBeforeNode,subNode,nodeid,offset,k,this])
      this.treehide(nodeid,offset,this.user)
      this.network.hide(nodeid,offset,this.user)
      this.processLocalOp(new EditOp(this).delete(k,1,nodeid,offset,this.user))
      //e.vis=false;
      //listNode.size.std = 0  // it is not longer visible
      //listNode.tln.rebalance()
  }

  insert(k,c) {
    return this.insertList(k,[c])
  }

  insertList(k,c) {

      //console.log('insertList '+k+' '+c)
      // the goal of this method is to make the appropriate call to treeinsert or treeextend
      // but not to actually modify the tree...
      let un=null
      if (this.strings.tln.sublistSize['rev']==0) {
        //console.log('case 0: this.size='+this.size)
        //console.dir(this)
        un = [this.user,this.count++]
        // CASE 0:  no-nonmarkers in the list, so tree must be empty

        // insert new node into the root of the empty tree
        this.treeinsert([0,0],0,un,c)
        this.network.insert([0,0],0,un,c)
        this.processLocalOp(new EditOp(this).insert(k,c,[0,0],0,un))
      }
      else if (k==0) {
        //console.log('case 1: k='+k)

        // CASE 1: inserting at the beginning of the string

        //  strategy - insert before the first non-marker character
        un = [this.user,this.count++]
        const e = this.strings.nth(0,"rev").data; //O(log(N))
        this.network.insert(e.nodeid,0,un,c);
        this.treeinsert(e.nodeid,0,un,c);
        this.processLocalOp(new EditOp(this).insert(k,c,e.nodeid,0,un))

      } else { // k>0
        //console.log('case2')
          // in the remaining cases we're inserting after a visible character
          // so, get the visible, non-marker elt e at position k-1
          const ecell=this.strings.nth(k-1,"std") //O(log(N))
          const ecellOffset = ecell.indexOf("std")
          const offsetInCell = k-ecellOffset

          // if offsetInCell<cellsize then we insert between 2 characters
          // if it == cellSize, then we either extend
          // and get the element after the ecell
          // here we need to check to see if we should split the node...
          // we need many more cases here ... or maybe not,
          // maybe the splitting happens in treeinsert ....
          var fcell=ecell.next;
          //console.dir([k,ecell,fcell,fcell.data.treeNode.user,this.user])
          if ((offsetInCell<ecell.data.size) || (!fcell.data.marker)){
            //console.log('case2a')
              // CASE 2a: inserting between two non-marker elements
              // here is the case where we insert between two characters in a Subnode
              un = [this.user,this.count++];
              this.network.insert(ecell.data.nodeid, ecell.data.first+offsetInCell,un,c);
              this.treeinsert(ecell.data.nodeid, ecell.data.first+offsetInCell,un,c);
              this.processLocalOp(new EditOp(this).insert(k,c,ecell.data.nodeid, ecell.data.first+offsetInCell,un))
          } else if (fcell.data.marker && (fcell.data == fcell.data.treeNode.end)) {

               //CASE 3: the next element is an end marker
              if (fcell.data.treeNode.user==this.user) {
                //console.log('case3a')
                  // case 3a: it the user owns the node then extend
                  //console.log("in InsertList case for treeextend")
                  //console.dir(fcell.data)
                  this.network.extend(fcell.data.nodeid, fcell.data.treeNode.elts.length, c);
                  this.treeextend(    fcell.data.nodeid, fcell.data.treeNode.elts.length, c);
                  this.processLocalOp(new EditOp(this).insertE(k,c,fcell.data.nodeid, fcell.data.treeNode.elts.length))
              }
              else {
                //console.log('case3b')

                un = [this.user, this.count++];
                // case 3b: otherwise insert a new node here
                //console.dir(fcell)
                this.network.insert(fcell.data.nodeid, fcell.data.treeNode.elts.length, un, c);
                this.treeinsert(    fcell.data.nodeid, fcell.data.treeNode.elts.length, un, c);
                this.processLocalOp(new EditOp(this).insert(k,c, fcell.data.nodeid, fcell.data.treeNode.elts.length, un, c))
              }
          } else {
            //console.log('case4')

                // CASE 4: the cell must be a start marker

                // in this case, find the next non-marker f (which must exist) and insert before f
                un = [this.user,this.count++];
                fcell = this.nextNonMarker(fcell); // O(log(N))

                this.network.insert(fcell.data.nodeid,0,un,c);
                this.treeinsert(fcell.data.nodeid,0,un,c);
                this.processLocalOp(new EditOp(this).insert(k,c,fcell.data.nodeid,0,un,c))
          }
      }
  }

}



/* ***********************************************************************
 * Here is an implementation of Elements for the MSET data type
 * The elements are the core objects that wrap the values stored in our DLL
 * An element is a subsequence of objects in the DLL which have the same visibility
 * and in which insertions are only allowed at the left. An insertion at the right
 * will be done in the node to the right (and if this Element is the last in the node,
 * then we will need to create a new last node (or maybe not ...)
 * When inserting into the middle of an element, the element must be split
 * Likewise when deleting a subrange of an element, the element must be split unless
 * the entire element will be deleted in which case the flag is just changed.
 */

class EditOp {
  // this creates a pair of complementary tree and string edit operations
  // on a particular tree. Given a tree edit it also generates the corresponding
  // string edit and vice versa. It also includes the list of deleted characters
  // in the delete ops so they can be easily inverted.
  constructor(d){
    //this.d = d
    this.treeOp={}
    this.stringOp={}
  }
  treeinsert(un,q,vm,cs,k){
    this.treeOp = {op:'treeinsert',un:un,q:q,vm:vm,cs:cs}
    this.stringOp = {op:'insert',k:k,cs:cs}
    return this
  }
  treeextend(un,q,cs,k){
    this.treeOp = {op:'treeextend',un:un, q:q, cs:cs}
    this.stringOp = {op:'insert',k:k,cs:cs}
    return this
  }
  treehide(un,q,u,size,k,cs){
    this.treeOp = {op:'treehide',un:un, q:q, u:u, cs:cs}
    this.stringOp = {op:'delete',k:k,cs:cs}
    return this  }
  insert(k,cs,un,q,vm){
    this.stringOp = {op:'insert',k:k,cs:cs}
    this.treeOp = {op:'treeinsert',un:un,q:q,vm:vm,cs:cs}
    //this.d.inTransitOps.push(this)
    //console.log("pushing into inTransitOps:")
    //console.log(JSON.stringify([this.stringOp,this.treeOp]))
    return this
  }
  insertE(k,cs,un,q){
    this.stringOp = {op:'insert',k:k,cs:cs}
    this.treeOp = {op:'treeextend',un:un,q:q,cs:cs}
    //this.d.inTransitOps.push(this)
    //console.log("pushing into inTransitOps:")
    //console.log(JSON.stringify([this.stringOp,this.treeOp]))
    return this
  }
  delete(k,size,un,q,u,cs){
    this.stringOp = {op:'delete',k:k,cs:cs}
    this.treeOp = {op:'treehide',un:un, q:q,cs:cs}
    //this.d.inTransitOps.push(this)
    //console.log("pushing into inTransitOps:")
    //console.log(JSON.stringify([this.stringOp,this.treeOp]))
    return this
  }
}


class Element{

 constructor (first,size,vis,marker,treeNode,isLast) {
    this.first = first
    this.size = size
    this.iset = null // we create an InsertionSet at the left if needed ...
    this.vis=vis;  // boolean -- true if it is visible, false if hidden
    this.marker=marker; // boolean -- true if it is a marker symbol, false otherwise
    this.treeNode=treeNode; // link to the treeNode containing this element
    //this.nodeid=null; // id of this.treeNode, this is redundant as treeNode has it
    this.listNode=null; // link to the Doubly Linked List element containing this element
    this.listSubnode=null;
    this.isLast = isLast // true when the element is the last in the node,  we don't need this..
    //console.dir(['in new Element',first,size,vis,marker,treeNode,isLast])
    this.userData = () => (treeNode.elts.slice(first,first+size)) // DEBUGGING!!
    this.nodeid = [treeNode.user,treeNode.count]
  }

  toStringIndent(k){
    let result = k+"|"+" ".repeat(k)
          +`S(${this.first}-${this.first+this.size},vis=${this.vis})\n`
    if (this.iset){
      result += this.iset.toStringIndent(k+4)
    } else {
      result += (k+4)+"|"+" ".repeat(k+4)+"iset-EMPTY\n"
    }
    result += k+"|"+" ".repeat(k+4)+ "DATA: "+(this.vis?this.userData():"["+this.userData()+"]")+"\n"
    return result
  }

  hide(){
    //console.log(this.vis+" vis -> false")
    this.vis=false
    this.rebalance()
  }

  delete(){
    this.listNode.delete()
    if (this.listSubnode) {
      // markers don't have listSubnodes
      this.listSubnode.delete()
    }
  }

  rebalance(){
    // this should be called when the size of a node is changed
    //console.log("in rebalance")
    //console.log('before: '+JSON.stringify(this.listNode.elementSize))
    //console.dir(this)
    const newEltSize = this.eltSize() //Element.sizefn(this)
    //console.log('after:  '+JSON.stringify(this.listNode.elementSize))
    this.listNode.elementSize = newEltSize
    this.listSubnode.elementSize = newEltSize
    this.listNode.tln.updateWeights()
    this.listSubnode.tln.updateWeights()
  }

  split(p){
    // split the subnode into two at the current offset
    // we do this when inserting an element between two characters in the node
    // and in this case the new nodes have the same visibility
    // we also do this when adding a new node of size zero at the end
    // but in this case the new right node should be visible
    // we also do this when deleting a node, and in that case only the
    // delete subset become non-visible. We will have split just copy the
    // visibility into the new nodes and the parent call should do the right thing
    // after they are built.
    // remove the old subnode and insert the two new subnodes into both lists
    //We split by removing the node and replacing it with two new nodes!
    let mLeft = new Element(  this.first,           p,  this.vis, false, this.treeNode, this.isLast)
    let mRight  = new Element(this.first+p, this.size-p,  this.vis, false, this.treeNode, this.isLast)
    let prevListNode = this.listNode.prev
    let prevListSubnode = this.listSubnode.prev

    if (this.deletedBy) {
      mLeft.deletedBy = this.deletedBy
      mRight.deletedBy = this.deletedBy
    }

    this.listNode.delete()
    this.listSubnode.delete()

    mLeft.listNode      = prevListNode.insertAfter(mLeft)
    mRight.listNode   = mLeft.listNode.insertAfter(mRight)

    mLeft.listSubnode      = prevListSubnode.insertAfter(mLeft)
    mRight.listSubnode   = mLeft.listSubnode.insertAfter(mRight)

    mLeft.iset = this.iset
    mRight.iset = new InsertionSet()

    return {left:mLeft,right:mRight}
  }



  // REWRITE THIS AS toString() ...
  toString(){

    //console.dir(this)
    if (this.marker){
      //console.dir(['a',this.userData])
      return this.userData()
    } else if (this.vis) {
      //console.dir(['b',this.first,this.size,this.treeNode.elts.slice(this.first,this.first+this.size)])
      return "("+this.treeNode.elts.slice(this.first,this.first+this.size)
                +":"+this.first+":"+this.size+") "
    } else {
      //console.dir(['c',this.first,this.size,"{"+this.treeNode.elts.slice(this.first,this.first+this.size)+"}"])
      return "[["+this.treeNode.elts.slice(this.first,this.first+this.size)+"]] "
    }

  }

  toList(){
    if (this.marker){
      return [this.userData()]
    } else if (!this.vis){
      return this.treeNode.elts
          .slice(this.first,this.first+this.size)
          .map((x)=>([x]))
    }else {
      return this.treeNode.elts.slice(this.first,this.first+this.size)
    }
  }

  // REWRITE THIS
  toStringLong2() {
    return "{"+this.userData()+","+this.vis+","+this.marker+","+this.nodeid+","+this.offset+"}";
  }


  eltSize(){
    const std = (this.vis)?this.size:0  // markers are not visible!
    const rev = (this.marker)?0:this.size
    const edit = this.size
    //console.dir(this)
    //console.log(JSON.stringify([this.vis,this.size,this.marker, std,rev,edit]))
    return {std:std,rev:rev,edit:edit,count:1}
  }

  static sizefn(element){
    return element?element.eltSize():{count:0,std:0,rev:0,edit:0}
  }

  static createStart(n){
      var startsym = "<"+n.user+":"+n.count
      var e = new Element('start',0,false,true,n,false)
      e.userData = ()=>startsym
      e.treeNode = n
      e.nodeid = [n.user, n.count]
      e.offset="start"
      e.size=1
      return e
  }

  static createEnd(n){
      var endsym = n.user+":"+n.count+">"
      var e = new Element('end',0,false,true,n,false)
      e.userData = ()=>endsym
      e.treeNode = n
      e.nodeid = [n.user, n.count]
      e.offset = "end"
      e.size=1
      return e
  }

} // end of Element class






/* ************************************************************
 * Here is an implementation of a Node in the MSET tree
 * It represnet
 */



class Node{
  constructor(u,n,elements) {
    this.user=u;
    this.count=n;
    this.elts= elements || [];
    this.subnodes = new DLLwi(Element.sizefn)

    this.start = Element.createStart(this)
    this.end = Element.createEnd(this)
    let eltSubnode = new Element(0,this.elts.length,true,false,this,true)

    eltSubnode.listSubnode = this.subnodes.first.insertAfter(eltSubnode)




  }

  toString(){
    return "node("+this.subnodes.toString("|",'count')+","+")"
  }

  toStringIndent(k){
    let result = k+"|"+" ".repeat(k)+"<"+this.user+":"+this.count+"\n"
    let subnodes = this.subnodes.toList()
    for(let i=0; i<subnodes.length; i++){
      result += subnodes[i].toStringIndent(k+4)
    }
    result += k+"|"+" ".repeat(k)+" "+this.user+":"+this.count+">\n"
    return result
  }

}

function compareNodes(x,y){
  if ( ((typeof(x)=='string')&&(x=="startmarker")) ||
       ((typeof(y)=='string')&&  (y=="endmarker")) ) {
    return -1
  } else if
    ( ((typeof(x)=='string')&&  (x=="endmarker")) ||
      ((typeof(y)=='string')&&(y=="startmarker")) ){
    return 1
  } else if ((typeof(x.user)=='number') && (typeof(y.user)=='number')){
    return x.user-y.user
  } else {
    //console.dir([x,y])
    throw new Error("trying to compare nodes with no user number!")
  }
}

class InsertionSet{
  // this is a O(log(N)) implementation of the insertion set
  // data structure which stores all of the nodes inserted at
  // a particular position k in a parent node
  // they are ordered by their owner and each owner
  // can insert at most one element into an insertion block
  // we also may need to access the previous element in the insertion set
  // so we need either indexing or a LL restructure
  // the first step is to move all iset related code into this class

  constructor(){
    this.bst = new BSTwi(compareNodes)
  }

  /* insertNode(m,s) inserts the node m into an ordered set s of nodes
   * (ordered by userid). This is called to create a child object of a node
   * and we insert the new node in the appropriate iset.
   * This needs to be reimplemented as a O(log(N)) operation ...
   */
  insertNode(m) {
    return this.bst.insert(m)
  }

  get(k){
    return this.bst.get(k)
  }

  toStringIndent(k){
    const nodes = this.bst.toList('count')
    let result = k+"|"+" ".repeat(k)+ "iset\n"
  /*
    for (let i=0; i<nodes.length; i++){
      result += nodes[i].toStringIndent(k+4) +"\n"
    }
    */
    for(let i=0; i<this.bst.size(); i++){
      result += this.bst.nth(i).data.toStringIndent(k+4) +"\n"
    }
    return result
  }
}

// these allow me access to the class from the Javascript console
window.DLLmset = DLLmset
window.EditOp = EditOp
window.Element = Element
window.Node = Node
window.InsertionSet = InsertionSet
//window.debugging={}
