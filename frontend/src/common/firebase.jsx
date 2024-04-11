import { GoogleAuthProvider, getAuth, signInWithPopup } from "firebase/auth";
import { initializeApp } from "firebase/app";

const firebaseConfig = {
  apiKey: "AIzaSyCZgUt3PGAzrG6QChtvbQAU6YdODQZDGgw",
  authDomain: "food-republic-16951.firebaseapp.com",
  projectId: "food-republic-16951",
  storageBucket: "food-republic-16951.appspot.com",
  messagingSenderId: "901807665599",
  appId: "1:901807665599:web:cb0d7f2f3fd5616478710a"
};


const app = initializeApp(firebaseConfig);

const provider = new GoogleAuthProvider();

const auth = getAuth();

export const authWithGoogle = async () =>{
    let user = null;
    
    await signInWithPopup(auth, provider)
    .then((result) =>{
        user = result.user
    })
    .catch((err) =>{
        console.log(err)
    })

    return user;
}