const express = require("express");
const cors = require("cors"); // ফ্রন্টএন্ড-ব্যাকএন্ড কানেকশনের জন্য cors ব্যবহার করা ভালো
const app = express();
const port = 5000;
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 📌 Middlewares
app.use(cors()); // CORS পলিসি হ্যান্ডেল করার জন্য
app.use(express.json()); // ফ্রন্টএন্ড থেকে আসা JSON বডি রিড করার জন্য (মোস্ট ইম্পর্ট্যান্ট)

app.get("/", (req, res) => {
  res.send("Hello World!");
});

const uri = process.env.MONGODB_URI;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();

    // 🗄️ ডাটাবেজ এবং স্টার্টআপ কালেকশন ডিফাইন করা হলো
    const database = client.db("startupforge_db_user");
    const startupCollection = database.collection("startups");
    const opportunityCollection = database.collection("opportunities");

    // ==========================================
    // 🚀 ১. নতুন স্টার্টআপ তৈরি করা (POST API)
    // ==========================================
    app.post("/api/startups", async (req, res) => {
      try {
        const startupData = req.body;

        // চেক করুন এই founderEmail দিয়ে অলরেডি কোনো স্টার্টআপ আছে কিনা
        const existingStartup = await startupCollection.findOne({ 
          founderEmail: startupData.founderEmail 
        });

        if (existingStartup) {
          return res.status(400).json({ 
            success: false, 
            message: "You already have a startup registered!" 
          });
        }

        // ডাটাবেজে ইনসার্ট করার আগে তৈরি হওয়ার সময় যুক্ত করে দেওয়া
        startupData.createdAt = new Date();

        // মঙ্গোডিবি কালেকশনে ডেটা সেভ করা
        const result = await startupCollection.insertOne(startupData);
        
        // সেভ হওয়া নতুন ডেটাটি রেসপন্স হিসেবে পাঠানো
        const savedStartup = await startupCollection.findOne({ _id: result.insertedId });
        res.status(201).json({ success: true, data: savedStartup });

      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 📋 ২. সেশন ইমেইল দিয়ে স্টার্টআপ খুঁজে বের করা (GET API)
    // ==========================================
    app.get("/api/startups/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const startup = await startupCollection.findOne({ founderEmail: email });
        
        if (!startup) {
          return res.status(404).json({ success: false, message: "Startup not found" });
        }
        
        res.status(200).json({ success: true, data: startup });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 📝 ৩. আইডি দিয়ে স্টার্টআপ প্রোফাইল আপডেট করা (PUT API)
    // ==========================================
    app.put("/api/startups/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        
        // মঙ্গোডিবির আপডেট অবজেক্টে সরাসরি স্ট্রিং আইডি রাখা যায় না, তাই এটি ডিলিট করা হলো
        delete updatedData._id; 

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            name: updatedData.name,
            logo: updatedData.logo,
            industry: updatedData.industry,
            fundingStage: updatedData.fundingStage,
            description: updatedData.description,
            founderEmail: updatedData.founderEmail,
            status: "pending", // আপডেট করার পর আবার পেন্ডিং হবে
            updatedAt: new Date() // আপডেটের সময় ট্র্যাক করার জন্য
          }
        };

        const result = await startupCollection.updateOne(filter, updateDoc);
        
        if (result.matchedCount === 1) {
          // আপডেট হওয়া লেটেস্ট ডেটা ডাটাবেজ থেকে এনে ফ্রন্টএন্ডে পাঠানো
          const updatedStartup = await startupCollection.findOne(filter);
          res.status(200).json({ success: true, data: updatedStartup });
        } else {
          res.status(404).json({ success: false, message: "Startup not found to update" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 🗑️ ৪. আইডি দিয়ে স্টার্টআপ প্রোফাইল ডিলিট করা (DELETE API)
    // ==========================================
    app.delete("/api/startups/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) }; // MongoDB এর ObjectId ফরম্যাটে কনভার্ট করা
        
        const result = await startupCollection.deleteOne(query);
        
        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Startup profile deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "No startup found with this ID" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 💼 ৫. নতুন অপরচুনিটি তৈরি করা (POST API) -> [🎯 NEW]
    // ==========================================
    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;

        // ডাটাবেজে সেভ করার আগে টাইমিং ট্র্যাক রাখার জন্য createdAt যোগ করা হলো
        opportunityData.createdAt = new Date();

        // opportunities কালেকশনে ডেটা ইনসার্ট করা
        const result = await opportunityCollection.insertOne(opportunityData);
        
        // সদ্য সেভ হওয়া ডেটাটি কনফার্মেশন হিসেবে রিটার্ন করা
        const savedOpportunity = await opportunityCollection.findOne({ _id: result.insertedId });
        res.status(201).json({ success: true, data: savedOpportunity });

      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 🔍 ৬. সব অপরচুনিটি গেট করা (GET API) -> [🎯 NEW]
    // ==========================================
    app.get("/api/opportunities", async (req, res) => {
      try {
        // সব অপরচুনিটি রিসেন্ট ডেট অনুযায়ী সর্ট করে নিয়ে আসা
        const opportunities = await opportunityCollection.find().sort({ createdAt: -1 }).toArray();
        res.status(200).json({ success: true, data: opportunities });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});