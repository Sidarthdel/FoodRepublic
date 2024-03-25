import {Link} from "react-router-dom";
import logo from "../imgs/restaurant.png";
import {useContext,useEffect} from "react";
import AnimationWrapper from "../common/page-animation";
import defaultBanner from"../imgs/blog banner.png";
import {EditorContext} from "../pages/editor.pages";
import EditorJS from "@editorjs/editorjs";
import {tools } from "./tools.component";
import {toast,Toaster} from "react-hot-toast";
import axios from "axios";
import {UserContext} from "../App";
import { useNavigate } from 'react-router-dom';




const BlogEditor = () =>{
   //Add blog:{banner} inside context below
    let {blog,blog:{title,content,tags, des},setBlog,textEditor,setTextEditor,setEditorState} = useContext(EditorContext)

    let {userAuth:{access_token}} = useContext(UserContext)
    let navigate = useNavigate();



    useEffect( ()=>{
        if(!textEditor.isReady){
            setTextEditor 
            (
                new EditorJS({
                    holderId:"textEditor",
                    data:content,
                    tools:tools,
                    placeholder:"Write here...."
                })
    
            )
        }
    },[])


    const handleBannerUpload = (e)=>{
        
        let img = e.target.files[0];
        
        console.log(img);
    }



    const handleTitleKeyDown =(e) =>{
        if(e.keyCode == 13){
            e.preventDefault();
        }
    }
    const handleTitleChange =(e) =>{
        let input = e.target;

        input.style.height = "auto"
        input.style.height = input.scrollHeight + "px";

        setBlog({...blog, title:input.value})

    }

    const handlePublishEvent = () => {
        // if(! banner.length){
        //     return toast.error("upload a banner")
        // }
        if(!title.length){
            return toast.error("title is required");
         }

        if(textEditor.isReady){
            textEditor.save().then(data =>{
                if(data.blocks.length){
                    setBlog({...blog, content: data});
                    setEditorState("publish")
                } else{
                    return toast.error("write something in blog to submit")
                }
            })
            .catch((err) =>{
                console.log(err);
            })
        }
        
    }

    const handleSaveDraft = (e) =>{
         if(e.target.className.includes('disable')){
            return;
        }
        if(!title.length){
            return toast.error("title is required to save draft");
        }
       

        let loadingToast = toast.loading("saving draft");

        e.target.classList.add('disable');

        if(textEditor.isReady){
            textEditor.save().then(content =>{

            let blogObj = {
            title,
            des,
            content,
            tags,
            draft: true
        }    

            axios.post(import.meta.env.VITE_SERVER_DOMAIN+"/create-blog",blogObj,{
            headers:{
                "Authorization":`Bearer ${access_token}`
            }
        }).then(()=>{
            e.target.classList.remove('disable');
            toast.dismiss(loadingToast);
            toast.success("Blog draft saved successfully");

            setTimeout(()=>{
                navigate("/")
            },500)
        })
        .catch(({response}) =>{
            e.target.classList.remove('disable');
            toast.dismiss(loadingToast);

            return toast.error(response.data.error)
        })   

            })
        }
        // add banner: banner inside blog object below
       
        
    }
    
    return (
        <>
        {
      // Toaster given may cause some error
        }
        
        <Toaster/>
        <nav className="navbar">
            <Link to="/" className="flex-none w-10">
                <img src={logo} className="w-full" />
            </Link>
            <p className="max-md:hidden text-black line-clamp-1 w-full">
                {title.length ? title : "untitled"}
            </p>

            <div className="flex gap-4 ml-auto">
                <button className="btn-dark py-2"
                 onClick = {handlePublishEvent}
                 >
                Publish
                </button>
                <button className="btn-light py-2"
                onClick={handleSaveDraft}
                >
                Save Draft
                </button>
            </div>
        </nav>

        <AnimationWrapper>
        <section>
            <div className="mx-auto max-w-[900px] w-full">
               <div className="relative aspect-video hover:opacity-80 bg-white border-4 border-grey">
                <label htmlFor="uploadBanner">
                    <img src={defaultBanner} alt="" 
                    className="z-20 " />
                    <input id="uploadBanner" type="file" access=".png, .jpg, .jpeg"
                     hidden 
                     onChange = {handleBannerUpload}
                     className="" />
                </label>
                </div> 
                <textarea name="" id=""  className="text-4xl font-medium w-full h-20 outline-none resize-none mt-10 leading-tight placeholder:opacity-40" 
                 defaultValue = {title}
                 onKeyDown={handleTitleKeyDown}
                 placeholder="Blog Title"
                 onChange ={handleTitleChange}
                 >
                </textarea>
                <hr className="w-full opacity-10 my-5" />

                <div id="textEditor" className="font-gelasio">

                </div>
            </div>
        </section>
        </AnimationWrapper>

        </>

    )
}

export default BlogEditor;