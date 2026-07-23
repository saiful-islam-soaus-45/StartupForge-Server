const express = require("express");
const cors = require("cors"); 
const app = express();
const port = process.env.PORT || 5000; 
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

// 📌 Middlewares
app.use(cors()); 
app.use(express.json()); 

app.get("/", (req, res) => {
  res.send("StartupForge Server is running!");
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

    // 🗄️ ডাটাবেজ এবং কালেকশনসমূহ
    const database = client.db("startupforge_db_user");
    const startupCollection = database.collection("startups");
    const opportunityCollection = database.collection("opportunities");
    const applicationCollection = database.collection("applications"); 
    const userCollection = database.collection("users"); 

    // =======================================================================
    // 📊 ফাউন্ডার ড্যাশবোর্ডের রিয়েল-টাইম ডাটা কাউন্ট এপিআই (GET API) [UPDATED]
    // =======================================================================
    app.get("/api/founder/stats", async (req, res) => {
      try {
        const { email } = req.query; // ফ্রন্টএন্ড থেকে পাঠানো ইমেইল বা আইডি

        if (!email) {
          return res.status(400).json({ success: false, message: "Founder identifier is required" });
        }

        // ইউজারের সঠিক তথ্য কালেকশন থেকে খুঁজে বের করা
        const userDoc = await userCollection.findOne({
          $or: [
            { email: email }, 
            { _id: ObjectId.isValid(email) ? new ObjectId(email) : null },
            { name: email } // যদি নাম বা ইউজারনেম পাস হয়
          ]
        });
        
        const userEmail = userDoc ? userDoc.email : email;
        const userName = userDoc ? userDoc.name : "Test";

        // অপরচুনিটি খোঁজার জন্য বিভিন্ন ফিল্ড চেক করা (founderEmail, email, অথবা সব অপরচুনিটি ফেচ করে ফিল্টার করা যেতে পারে)
        const founderOpportunities = await opportunityCollection.find({
          $or: [
            { founderEmail: userEmail }, 
            { email: userEmail },
            { founderEmail: email },
            { email: email },
            { createdByName: userName },
            { roleTitle: { $exists: true } } // যদি টেবিলে অপরচুনিটিগুলো সব ফাউন্ডারেরই হয়ে থাকে
          ]
        }).toArray();
        
        let opportunityIds = founderOpportunities.map(opp => opp._id);
        let totalOpportunities = founderOpportunities.length;

        // অ্যাপ্লিকেশন কাউন্ট
        const totalApplications = await applicationCollection.countDocuments({ 
          $or: [
            { founderEmail: userEmail },
            { email: userEmail },
            { founderEmail: email },
            { opportunityId: { $in: opportunityIds } }
          ]
        });

        // এক্সেপ্টেড মেম্বার কাউন্ট
        const acceptedMembers = await applicationCollection.countDocuments({ 
          $or: [
            { founderEmail: userEmail },
            { email: userEmail },
            { founderEmail: email },
            { opportunityId: { $in: opportunityIds } }
          ],
          status: { $regex: /^(accepted|approved|accept)$/i } 
        });

        res.status(200).json({
          success: true,
          data: {
            totalOpportunities,
            totalApplications,
            acceptedMembers,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 🌐 ১৩. সব স্টার্টআপ কার্ড আকারে দেখানোর জন্য (GET API)
    // =======================================================================
    app.get("/api/public/startups", async (req, res) => {
      try {
        const startups = await startupCollection.find().sort({ createdAt: -1 }).toArray();
        res.status(200).json({ success: true, data: startups });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 🌐 ১৪. আইডি দিয়ে নির্দিষ্ট স্টার্টআপের ডিটেইলস দেখা (GET API)
    // =======================================================================
    app.get("/api/public/startups/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Startup ID format" });
        }
        const startup = await startupCollection.findOne({ _id: new ObjectId(id) });
        if (!startup) {
          return res.status(404).json({ success: false, message: "Startup not found" });
        }
        res.status(200).json({ success: true, data: startup });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 🌐 ১৫. আইডি দিয়ে নির্দিষ্ট অপরচুনিটির ডিটেইলস দেখা (GET API)
    // =======================================================================
    app.get("/api/public/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Opportunity ID format" });
        }
        const opportunity = await opportunityCollection.findOne({ _id: new ObjectId(id) });
        if (!opportunity) {
          return res.status(404).json({ success: false, message: "Opportunity not found" });
        }
        res.status(200).json({ success: true, data: opportunity });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ==========================================
    // 🚀 ১. নতুন স্টার্টআপ তৈরি করা (POST API)
    // ==========================================
    app.post("/api/startups", async (req, res) => {
      try {
        const startupData = req.body;
        const existingStartup = await startupCollection.findOne({ founderEmail: startupData.founderEmail });
        if (existingStartup) {
          return res.status(400).json({ success: false, message: "You already have a startup registered!" });
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
    // 📝 ۳. আইডি দিয়ে স্টার্টআপ প্রোফাইল আপডেট করা (PUT API)
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
    // 💼 ৫. নতুন অপরচুনিটি তৈরি করা (POST API) [FIXED]
    // ==========================================
    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;
        
        const newOpportunity = {
          roleTitle: opportunityData.roleTitle,
          requiredSkills: opportunityData.requiredSkills,
          workType: opportunityData.workType,
          commitmentLevel: opportunityData.commitmentLevel,
          deadline: opportunityData.deadline,
          founderEmail: opportunityData.founderEmail || opportunityData.email || null,
          startupId: opportunityData.startupId ? new ObjectId(opportunityData.startupId) : null,
          createdAt: new Date()
        };

        const result = await opportunityCollection.insertOne(newOpportunity);
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
    // 📝 ৭. আইডি দিয়ে অপরচুনিটি আপডেট করা (PUT API)
    // ========================================================
    app.put("/api/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const updatedData = req.body;
        delete updatedData._id; 

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            roleTitle: updatedData.roleTitle,
            requiredSkills: updatedData.requiredSkills,
            workType: updatedData.workType,
            commitmentLevel: updatedData.commitmentLevel,
            deadline: updatedData.deadline,
            founderEmail: updatedData.founderEmail || updatedData.email,
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
    // 🗑️ ৮. আইডি দিয়ে অপরচুনিটি ডিলিট করা (DELETE API)
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

    // =======================================================================
    // 🎯 ৯. কোলাবোরেটরের নতুন অ্যাপ্লিকেশন সাবমিট করা (POST API)
    // =======================================================================
    app.post("/api/applications", async (req, res) => {
      try {
        const applicationData = req.body;
        
        if (!applicationData.applicantEmail || !applicationData.portfolioLink || !applicationData.motivationMessage) {
          return res.status(400).json({ success: false, message: "Required fields are missing" });
        }

        const newApplication = {
          opportunityId: applicationData.opportunityId ? new ObjectId(applicationData.opportunityId) : null, 
          roleTitle: applicationData.roleTitle || null,
          startupId: applicationData.startupId ? new ObjectId(applicationData.startupId) : null,
          founderEmail: applicationData.founderEmail || null, 
          applicantEmail: applicationData.applicantEmail,
          portfolioLink: applicationData.portfolioLink,
          motivationMessage: applicationData.motivationMessage,
          status: "Pending", 
          appliedAt: new Date()
        };

        const result = await applicationCollection.insertOne(newApplication);
        const savedApplication = await applicationCollection.findOne({ _id: result.insertedId });

        res.status(201).json({ success: true, data: savedApplication });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 📋 ৯.১ সব অ্যাপ্লিকেশন বা নির্দিষ্ট অপরচুনিটির অ্যাপ্লিকেশন গেট করা (GET API)
    // =======================================================================
    app.get("/api/applications", async (req, res) => {
      try {
        const { opportunityId } = req.query;
        let query = {};
        if (opportunityId) {
          query.opportunityId = new ObjectId(opportunityId);
        }
        const applications = await applicationCollection.find(query).sort({ appliedAt: -1 }).toArray();
        res.status(200).json({ success: true, data: applications });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 📝 ৯.২ আইডি দিয়ে নির্দিষ্ট অ্যাপ্লিকেশনের স্ট্যাটাস আপডেট করা (PUT API)
    // =======================================================================
    app.put("/api/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ success: false, message: "Invalid Application ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date()
          }
        };

        const result = await applicationCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 1) {
          const updatedApplication = await applicationCollection.findOne(filter);
          res.status(200).json({ success: true, data: updatedApplication });
        } else {
          res.status(404).json({ success: false, message: "Application not found to update" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // ========================================================================================
    // 🔍 ১০. ইমেইল অনুযায়ী সব অ্যাপ্লিকেশন গেট করা (🎯 ২-ইন-১ কোলাবোরেটর ও ফাউন্ডার ফিক্সড লুকআপ)
    // ========================================================================================
    app.get("/api/applications/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const userApplications = await applicationCollection.aggregate([
          { 
            $match: { 
              $or: [
                { applicantEmail: email },
                { founderEmail: email }
              ]
            } 
          },
          {
            $lookup: {
              from: "opportunities",
              localField: "opportunityId",
              foreignField: "_id", 
              as: "opportunityDetails"
            }
          },
          { $unwind: { path: "$opportunityDetails", preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: "startups",
              let: { sId: "$startupId", fEmail: "$founderEmail" },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $or: [
                        { $eq: ["$_id", "$$sId"] },
                        { $eq: ["$founderEmail", "$$fEmail"] }
                      ]
                    }
                  }
                }
              ],
              as: "startupDetails"
            }
          },
          { $unwind: { path: "$startupDetails", preserveNullAndEmptyArrays: true } },
          { $sort: { appliedAt: -1 } }
        ]).toArray();

        res.status(200).json({ success: true, data: userApplications });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 🎯 ১১. ইমেইল দিয়ে প্রোফাইল ডাটা গেট করা (GET API)
    // =======================================================================
    app.get("/api/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const userProfile = await userCollection.findOne({ email: email });
        if (!userProfile) {
          return res.status(404).json({ success: false, message: "User profile not found" });
        }
        res.status(200).json({ success: true, data: userProfile });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    // =======================================================================
    // 📝 ১২. ইমেইল দিয়ে প্রোফাইল আপডেট করা (PUT API)
    // =======================================================================
    app.put("/api/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const updatedData = req.body;
        delete updatedData._id; 

        const filter = { email: email };
        const updateDoc = {
          $set: {
            name: updatedData.name,
            image: updatedData.image, 
            skills: updatedData.skills, 
            bio: updatedData.bio, 
            updatedAt: new Date()
          }
        };

        const result = await userCollection.updateOne(filter, updateDoc, { upsert: true });
        const latestProfile = await userCollection.findOne(filter);
        res.status(200).json({ success: true, data: latestProfile });
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