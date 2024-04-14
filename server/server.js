import express from 'express';
import mongoose from 'mongoose';
import 'dotenv/config';
import bcrypt from 'bcrypt';
import { nanoid } from 'nanoid';
import jwt from 'jsonwebtoken';
import cors from 'cors';
import aws from "aws-sdk";
import admin from 'firebase-admin';
import serviceAccountKey from "./food-republic-16951-firebase-adminsdk-6ru9h-80ac4c04ee.json" assert { type: "json" };
import { OpenAI } from "openai";
import User from './Schema/User.js';
import Blog from './Schema/Blog.js';
import Notification from "./Schema/Notification.js"
import { getAuth } from 'firebase-admin/auth';

const server = express();
let PORT = 3000;
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

admin.initializeApp({
    credential: admin.credential.cert(serviceAccountKey)
})

let emailRegex = /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/; // regex for email
let passwordRegex = /^(?=.*\d)(?=.*[a-z])(?=.*[A-Z]).{6,20}$/; // regex for password

server.use(express.json());
server.use(cors());

mongoose.connect(process.env.DB_LOCATION, {
    autoIndex: true
})

// setting up s3 bucket
const s3 = new aws.S3({
    region: 'ap-south-1',
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
})

const generateUploadURL = async () => {

    const date = new Date();
    const imageName = `${nanoid()}-${date.getTime()}.jpeg`;

    return await s3.getSignedUrlPromise('putObject', {
        Bucket: 'food-republic-website',
        Key: imageName,
        Expires: 1000,
        ContentType: "image/jpeg"
    })

}

const verifyJWT = (req, res, next) => {

    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(" ")[1];

    if (token == null) {
        return res.status(401).json({ error: "no access token" })
    }
    jwt.verify(token, process.env.SECRET_ACCESS_KEY, (err, user) => {
        if (err) {
            return res.status(403).json({ error: "access token is invalid" })
        }

        req.user = user.id

        next()
    })

}
const formatDatatoSend = (user) => {
    const access_token = jwt.sign({ id: user._id }, process.env.SECRET_ACCESS_KEY)
    return {
        access_token,
        profile_img: user.personal_info.profile_img,
        username: user.personal_info.username,
        fullname: user.personal_info.fullname
    }
}
const generateUsername = async (email) => {
    let username = email.split("@")[0];

    let isUsernameNotUnique = await User.exists({ "personal_info.username": username }).then((result) => result);

    isUsernameNotUnique ? username += nanoid().substring(0, 5) : "";

    return username;
}

// upload image url route
server.get('/get-upload-url', (req, res) => {
    generateUploadURL().then(url => res.status(200).json({ uploadURL: url }))
        .catch(err => {
            console.log(err.message);
            return res.status(500).json({ error: err.message })
        })
})


server.post("/signup", (req, res) => {
    let { fullname, email, password } = req.body;

    if (fullname.length < 3) {
        return res.status(403).json({ "error": "fullname should be atleast 3 characters long" })
    }
    if (!email.length) {
        return res.status(403).json({ "error": "email is required" })
    }
    if (!emailRegex.test(email)) {
        return res.status(403).json({ "error": "email is invalid" })
    }
    if (!passwordRegex.test(password)) {
        return res.status(403).json({ "error": "password should be 6 to 20 charcters long with a numeric, 1 lowercase and 1 uppercase letter" })
    }

    bcrypt.hash(password, 10, async (err, hashed_password) => {

        let username = await generateUsername(email);

        let user = new User({
            personal_info: {
                fullname,
                email,
                password: hashed_password,
                username
            }
        })

        user.save().then((u) => {
            return res.status(200).json(formatDatatoSend(u))
        })
            .catch(err => {

                if (err.code == 11000) {
                    return res.status(500).json({ "error": "email already exists" })
                }
                return res.status(500).json({ "error": err.message })
            })
    })

})

server.post("/signin", (req, res) => {
    let { email, password } = req.body;

    User.findOne({ "personal_info.email": email })
        .then(
            (user) => {
                if (!user) {
                    return res.status(403).json({ "error": "email not found" })
                }

                if (!user.google_auth) {

                    bcrypt.compare(password, user.personal_info.password, (err, result) => {
                        if (err) {
                            return res.status(403).json({ "error": "error occurred while login please try again" });
                        }
                        if (!result) {
                            return res.status(403).json({ "error": "Incorrect password" });
                        } else {
                            return res.status(200).json(formatDatatoSend(user))
                        }
                    })

                } else {
                    return res.status(403).json({ "error": "Account was created using google. Try logging in with google sign in" })
                }


            }
        ).catch(err => {
            console.log(err);
            return res.status(500).json({ "error": err.message })
        })
})

server.post("/google-auth", async (req, res) => {

    let { access_token } = req.body

    getAuth()
        .verifyIdToken(access_token)
        .then(async (decodedUser) => {
            let { email, name, picture } = decodedUser;

            picture = picture.replace("s96-c", "s384-c");

            let user = await User.findOne({ "personal_info.email": email }).select("personal_info.fullname personal_info.username personal_info.profile_img google_auth")
                .then((u) => { return u || null })
                .catch(err => { return res.status(500).json({ "error": err.message }) })

            if (user) {
                if (!user.google_auth) {
                    return res.status(403).json({ "error": "This email was signed up without google. Please login with password to access the account" })
                }
            }
            else {
                let username = await generateUsername(email);
                user = new User({
                    personal_info: { fullname: name, email, profile_img: picture, username },
                    google_auth: true
                })

                await user.save().then((u) => {
                    user = u;
                })
                    .catch(err => {
                        return res.status(500).json({ "error": err.message })
                    })
            }

            return res.status(200).json(formatDatatoSend(user))

        })
        .catch(err => {
            return res.status(500).json({ "error": "failed to authenticate with google, try signing in with another account" })
        })

})


server.post("/change-password", verifyJWT, (req, res) => {
    let { currentPassword, newPassword } = req.body;

    if (!passwordRegex.test(currentPassword) || !passwordRegex.test(newPassword)) {

        return res.status(403).json({ error: "password should be 6 to 20 charcters long with a numeric, 1 lowercase and 1 uppercase letter" })

    }

    User.findOne({ _id: req.user }).then((user) => {
        // if(user.google_auth){
        //   return res.status(403).json({error:"you are using google auth, you can't change password"})     
        // }
        bcrypt.compare(currentPassword, user.personal_info.password, (err, result) => {
            if (err) {
                return res.status(500).json({ error: "error occurred while changing password, please try again" })
            }

            if (!result) {
                return res.status(403).json({ error: "Incorrect current password" })
            }

            bcrypt.hash(newPassword, 10, (err, hashed_password) => {
                User.findOneAndUpdate({ _id: req.user }, { "personal_info.password": hashed_password })
                    .then((u) => {
                        return res.status(200).json({ status: "password changed successfully" })

                    })
                    .catch(err => {
                        return res.status(500).json({ error: "error occurred while changing password, please try again" })
                    })
            })
        })

    }
    )
        .catch(err => {
            console.log(err);
            res.status(500).json({ error: "user not found" })
        })


})






server.post('/latest-blogs', (req, res) => {

    let { page } = req.body;

    let maxLimit = 3;

    Blog.find({ draft: false })
        .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
        .sort({ "publishedAt": -1 })
        .select("blog_id title des banner activity tags publishedAt -_id")
        .skip((page - 1) * maxLimit)
        .limit(maxLimit)
        .then(blogs => {
            return res.status(200).json({ blogs })
        }
        )
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
})

server.post("/all-latest-blogs-count", (req, res) => {
    Blog.countDocuments({ draft: false })
        .then(count => {
            return res.status(200).json({ totalDocs: count })
        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
})

server.get('/trending-blogs', (req, res) => {
    Blog.find({ draft: false })
        .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
        .sort({ "activity.total_read": -1, "activity.total_likes": -1, "publishedAt": -1 })
        .select("blog_id title publishedAt -_id")
        .limit(2)
        .then(blogs => {
            return res.status(200).json({ blogs })
        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
})

server.post("/search-users", (req, res) => {

    let { query } = req.body;

    User.find({ "personal_info.username": new RegExp(query, 'i') })
        .limit(20)
        .select("personal_info.fullname personal_info.username personal_info.profile_img -_id")
        .then(users => {
            return res.status(200).json({ users })
        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
})


server.post("/get-profile", (req, res) => {
    let { username } = req.body;

    User.findOne({ "personal_info.username": username })
        .select("-personal_info.password -google_auth -updatedAt -blogs")
        .then(user => {
            return res.status(200).json(user)
        })
        .catch(err => {
            console.log(err);
            return res.status(500).json({ error: err.message })
        })

})

server.post("/search-blogs", (req, res) => {

    let { tag, query, author, page, limit, eliminate_blog } = req.body;

    let findQuery;

    if (tag) {
        findQuery = { tags: tag, draft: false, blog_id: { $ne: eliminate_blog } };
    } else if (query) {
        findQuery = { draft: false, title: new RegExp(query, 'i') }
    } else if (author) {
        findQuery = { author, draft: false }
    }

    let maxLimit = limit ? limit : 2;
    //add banner inside
    Blog.find(findQuery)
        .populate("author", "personal_info.profile_img personal_info.username personal_info.fullname -_id")
        .sort({ "publishedAt": -1 })
        .select("blog_id title des banner activity tags publishedAt -_id")
        .skip((page - 1) * maxLimit)
        .limit(maxLimit)
        .then(blogs => {
            return res.status(200).json({ blogs })
        }
        )
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
})

server.post("/search-blogs-count", (req, res) => {
    let { tag, author, query } = req.body;
    let findQuery;
    if (tag) {
        findQuery = { tags: tag, draft: false };
    } else if (query) {
        findQuery = { draft: false, title: new RegExp(query, 'i') }
    } else if (author) {
        findQuery = { author, draft: false }
    }

    Blog.countDocuments(findQuery)
        .then(count => {
            return res.status(200).json({ totalDocs: count })

        })
        .catch(err => {
            return res.status(500).json({ error: err.message })
        })
}
)
server.post('/create-blog', verifyJWT, (req, res) => {

    let authorId = req.user;

    let { title, des, banner, tags, content, draft, id } = req.body;

    if (!title.length) {
        return res.status(403).json({ error: "Title is required" })
    }

    if (!draft) {
        if (!des.length || des.length > 200) {
            return res.status(403).json({ error: "Description is required and should be less than 200 characters" })
        }

        if (!banner.length) {
            return res.status(403).json({ error: "Banner is required" })
        }

        if (!content.blocks.length) {
            return res.status(403).json({ error: "Content is required" })
        }
        if (!tags.length || tags.length > 10) {
            return res.status(403).json({ error: "Tags are required and should be less than 10" })
        }
    }

    tags = tags.map(tag => tag.toLowerCase());

    let blog_id = id || title.replace(/[^a-zA-Z0-9]/g, ' ').replace(/\s+/g, "-").trim() + nanoid();

    if (id) {

        Blog.findOneAndUpdate({ blog_id }, { title, des, banner, content, tags, draft: draft ? draft : false })
            .then(() => {
                return res.status(200).json({ id: blog_id });
            })
            .catch(err => {
                return res.status(500).json({ error: "err.message" })
            })

    } else {
        let blog = new Blog({
            title,
            des,
            banner,
            content,
            tags,
            author: authorId,
            blog_id,
            draft: Boolean(draft)

        })

        blog.save().then(blog => {

            let increamentVal = draft ? 0 : 1;

            User.findOneAndUpdate({ _id: authorId }, { $inc: { "account_info.total_posts": increamentVal }, $push: { "blogs": blog._id } })
                .then(user => {
                    return res.status(200).json({ id: blog.blog_id })
                })
                .catch(err => {
                    return res.status(500).json({ error: "failed to update post number" })
                })
        })
            .catch(err => {
                return res.status(500).json({ error: err.message })
            })

    }



})

server.post("/get-blog", (req, res) => {

    let { blog_id, draft, mode } = req.body;

    let incrementVal = mode != 'edit' ? 1 : 0;

    Blog.findOneAndUpdate({ blog_id }, { $inc: { "activity.total_reads": incrementVal } })
        .populate("author", "personal_info.fullname personal_info.username personal_info.profile_img")
        .select("title des content banner activity publishedAt blog_id tags")
        .then(blog => {

            User.findOneAndUpdate({ "personal_info.username": blog.author.personal_info.username }, {
                $inc: { "account_info.total_reads": incrementVal }
            })
                .catch(err => {
                    return res.status(500).json({ error: err.message })
                })

            if (blog.draft && !draft) {
                return res.status(500).json({ error: 'you cannot access draft blogs.' })
            }

            return res.status(200).json({ blog });
        })
        .catch(err => {
            return res.status(500).json({ error: err.message });
        })
})





server.post('/generateTag', async (req, res) => {

    try {

        const { des } = req.body;

        const prompt = ` Generate tags for the following description related to the topic of food such that it can be classified into these following appropriate tags namely, Food-Recipe,Food-Review,Restaurant-Review blog:\n"${des}"\nTags:`;


        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: "system", content: "you are an AI capable of  Generating tags for the food blog description that will be provided, also generate tags without hashtags in the beginning and limit the number of tags generated to atmost 2. Generate tags based on the relevance in a sorted order please be carefull and remove hastags from the ouput generated do  not add hashtags with the output generated " },

                { role: "user", content: prompt },
            ],

        });



        const tags = response.choices[0].message.content.split(" ").slice(0, 4);

        return res.json({ tags: tags });

    } catch (error) {
        console.error('Error generating tags:', error);


        return res.json({ error: 'An error occurred while generating tags' });
    }



})

server.post('/generateSummary', async (req, res) => {

    try {

        const { contents } = req.body;

        const prompt = ` Generate summary for the following blog related to the topic namely, Food-Recipe,Food-Review,Restaurant-Review blog:\n"${contents}"\nTags:`;


        const response = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: "system", content: "you are an AI capable of  generating summary for the a blog that will be provided, generate summary that is relevant to the blog content and generate summary that is between 300 and 400 characters in length " },

                { role: "user", content: prompt },
            ]

        });

        const summary = response.choices[0].message.content
        return res.json({ summary: summary })



    } catch (error) {
        console.error('Error generating tags:', error);


        return res.json({ error: 'An error occurred while generating tags' });
    }
})


server.post("/like-blog", verifyJWT, (req, res) => {
    let user_id = req.user;

    let { _id, isLikedByUser } = req.body;

    let incrementVal = !isLikedByUser ? 1 : -1;

    Blog.findOneAndUpdate({ _id }, { $inc: { "activity.total_likes": incrementVal } }).then(blog => {
        if (!isLikedByUser) {
            let like = new Notification({
                type: "like",
                blog: _id,
                notification_for: blog.author,
                user: user_id
            })

            like.save().then(notification => {
                return res.status(200).json({ liked_by_user: true })
            })
        } else{

            Notification.findOneAndDelete({user: user_id, blog: _id, type: "like"})
            .then(data => {
                return res.status(200).json({liked_by_user: false})
            })
            .catch(err => {
                return res.status(500).json({ error: err.message });
            })
        }
    })
})

server.post("/isliked-by-user", verifyJWT, (req, res) => {
    let user_id = req.user;

    let { _id } = req.body;

    Notification.exists({user: user_id, type: "like", blog: _id})
    .then(result => {
        return res.status(200).json({result})
    })
    .catch(err => {
        return res.status(500).json({error: err.message})
    })
})

server.listen(PORT, () => {
    console.log('listening on port -> ' + PORT);
})
