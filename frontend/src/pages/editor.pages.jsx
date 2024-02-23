import { useContext, useState } from 'react';
import {UserContext} from '../App';
import { Navigate } from 'react-router-dom';
const Editor = () =>{

    const [editorState, setEditorState] = useState("editor");

    let {userAuth:{access_token}} = useContext(UserContext)

    return (
        access_token === null ? <Navigate to="/signin"/> :
        editorState == "editor" ? <h1>Blog Editor</h1> : <h1>Blog preview</h1>
    )
}

export default Editor;