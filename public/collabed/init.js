import {TextWindow} from './TextWindow.js'
import {CanvasEditor} from './CanvasEditor.js'
export {ed1,tw,ddllSpec}

const ddllSpec= {namespace:"/demo2", documentId:"default"}
const tw = new TextWindow(ddllSpec)

const ed1 = new CanvasEditor(mset,tw)
