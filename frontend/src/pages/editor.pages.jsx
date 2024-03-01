import { useContext, useState } from 'react';
import {UserContext} from '../App';
import { Navigate } from 'react-router-dom';
import BlogEditor from '../components/blog-editor.component';
import Publishform from '../components/publish-form.component';
import {createContext} from 'react';

// add this inside- banner: '',
const blogStructure = {
    title: '',
    content: [],
    tags: [],
    des: '',
    author: {personal_info:{}}
}

export const EditorContext = createContext({});

const Editor = () =>{

    const [blog,setBlog] = useState(blogStructure)
    const [editorState, setEditorState] = useState("editor");
    const [textEditor, setTextEditor] = useState({isReady:false});

    let {userAuth:{access_token}} = useContext(UserContext)

    return (
        <EditorContext.Provider value={{blog, setBlog,editorState,setEditorState,textEditor, setTextEditor}}>
            {         
            access_token === null ? <Navigate to="/signin"/> :
            editorState == "editor" ? <BlogEditor/> : <Publishform/>
            }
        </EditorContext.Provider>
    )
}

export default Editor;