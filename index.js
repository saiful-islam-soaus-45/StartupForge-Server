const express = require("express");
const cors = require("cors"); 
const app = express();
const port = 5000;
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 📌 Middlewares
app.use(cors()); 
app.use(express.json()); 

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

        const existingStartup = await startupCollection.findOne({ 
          founderEmail: startupData.founderEmail 
        });

        if (existingStartup) {
          return res.status(400).json({ 
            success: false, 
            message: "You already have a startup registered!" 
          });
        }

        startupData.createdAt = new Date();
        const result = await startupCollection.insertOne(startupData);
        
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
            status: "pending", 
            updatedAt: new Date() 
          }
        };

        const result = await startupCollection.updateOne(filter, updateDoc);
        
        if (result.matchedCount === 1) {
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
        const query = { _id: new ObjectId(id) }; 
        
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
    // 💼 ৫. নতুন অপরচুনিটি তৈরি করা (POST API) 
    // ==========================================
    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;
        opportunityData.createdAt = new Date();

        const result = await opportunityCollection.insertOne(opportunityData);
        
        const savedOpportunity = await opportunityCollection.findOne({ _id: result.insertedId });
        res.status(201).json({ success: true, data: savedOpportunity });

      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 🔍 ৬. সব অপরচুনিটি গেট করা (GET API) 
    // ==========================================
    app.get("/api/opportunities", async (req, res) => {
      try {
        const opportunities = await opportunityCollection.find().sort({ createdAt: -1 }).toArray();
        res.status(200).json({ success: true, data: opportunities });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ========================================================
    // 📝 ৭. [🎯 NEW ADDED] আইডি দিয়ে অপরচুনিটি আপডেট করা (PUT API)
    // ========================================================
    app.put("/api/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        delete updatedData._id; // সিকিউরিটির জন্য মেইন অবজেক্ট আইডি রিমুভ করা হলো

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            roleTitle: updatedData.roleTitle,
            requiredSkills: updatedData.requiredSkills,
            workType: updatedData.workType,
            commitmentLevel: updatedData.commitmentLevel,
            deadline: updatedData.deadline,
            updatedAt: new Date()
          }
        };

        const result = await opportunityCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 1) {
          const latestData = await opportunityCollection.findOne(filter);
          res.status(200).json({ success: true, data: latestData });
        } else {
          res.status(404).json({ success: false, message: "Opportunity not found to update" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =========================================================
    // 🗑️ ৮. [🎯 NEW ADDED] আইডি দিয়ে অপরচুনিটি ডিলিট করা (DELETE API)
    // =========================================================
    app.delete("/api/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await opportunityCollection.deleteOne(query);
        
        if (result.deletedCount === 1) {
          res.status(200).json({ success: true, message: "Opportunity deleted successfully" });
        } else {
          res.status(404).json({ success: false, message: "Opportunity not found to delete" });
        }
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