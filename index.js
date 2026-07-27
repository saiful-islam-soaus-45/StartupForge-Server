const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//  Middlewares
app.use(cors());
app.use(express.json());

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
    console.log("Connected successfully to MongoDB!");

    //  ডাটাবেজ এবং কালেকশনসমূহ (আপনার কালেকশন নাম "user" সঠিক রাখা হলো)
    const database = client.db("startupforge_db_user");
    const startupCollection = database.collection("startups");
    const opportunityCollection = database.collection("opportunities");
    const applicationCollection = database.collection("applications");
    const userCollection = database.collection("user");
    const subscriptionCollection = database.collection("subscriptions");

    app.get("/", (req, res) => {
      res.send("StartupForge Server is running!");
    });

    // subscription api
    app.post("/api/subscription", async (req, res) => {
      try {
        const { user, session_id } = req.body;

        const isExistSession = await subscriptionCollection.findOne({
          sessionId: session_id,
        });

        if (isExistSession) {
          return res.json({
            success: true,
            message: "Already upgraded",
          });
        }

        // এখানেই পরিবর্তন করবে
        await subscriptionCollection.insertOne({
          userId: new ObjectId(user.id),
          sessionId: session_id,

          amount: 14,
          currency: "USD",
          paymentStatus: "Paid",

          createdAt: new Date(),
        });

        await userCollection.updateOne(
          { _id: new ObjectId(user.id) },
          {
            $set: {
              plan: "pro",
            },
          },
        );

        const updatedUser = await userCollection.findOne({
          _id: new ObjectId(user.id),
        });

        res.json({
          success: true,
          user: updatedUser,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // api overview

    app.get("/api/admin/overview", async (req, res) => {
      try {
        const totalUsers = await userCollection.countDocuments();
        const totalStartups = await startupCollection.countDocuments();
        const totalOpportunities = await opportunityCollection.countDocuments();

        // 👇 এখানে বসাও
        const allSubscriptions = await subscriptionCollection.find().toArray();

        console.log("Total subscriptions:", allSubscriptions.length);
        console.log(allSubscriptions);

        // 👇 তারপর aggregate
        const revenueResult = await subscriptionCollection
          .aggregate([
            {
              $group: {
                _id: null,
                totalRevenue: {
                  $sum: "$amount",
                },
              },
            },
          ])
          .toArray();

        console.log("Revenue Result:", revenueResult);

        const totalRevenue =
          revenueResult.length > 0 ? revenueResult[0].totalRevenue : 0;

        res.json({
          success: true,
          data: {
            users: totalUsers,
            startups: totalStartups,
            opportunities: totalOpportunities,
            revenue: totalRevenue,
          },
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // startup toggling
    app.patch("/api/admin/startups/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await startupCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
            },
          },
        );

        res.json({
          success: true,
          result,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // transaction history api
    // ================= Admin Transactions =================
    app.get("/api/admin/transactions", async (req, res) => {
      try {
        const transactions = await subscriptionCollection
          .aggregate([
            {
              $lookup: {
                from: "user",
                localField: "userId",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $unwind: "$user",
            },
            {
              $project: {
                _id: 1,
                sessionId: 1,
                createdAt: 1,

                userName: "$user.name",
                userEmail: "$user.email",

                // Amount
                amount: {
                  $ifNull: ["$amount", 14],
                },

                currency: {
                  $ifNull: ["$currency", "USD"],
                },

                paymentStatus: {
                  $ifNull: ["$paymentStatus", "Paid"],
                },
              },
            },
            {
              $sort: {
                createdAt: -1,
              },
            },
          ])
          .toArray();

        res.json({
          success: true,
          data: transactions,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    app.get("/api/my-opportunities-count", async (req, res) => {
      try {
        const { userId } = req.query;

        if (!userId) {
          return res.status(400).json({
            success: false,
            message: "User ID is required",
          });
        }

        const user = await userCollection.findOne({
          _id: new ObjectId(userId),
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found",
          });
        }

        const count = await opportunityCollection.countDocuments({
          userId: userId,
        });

        res.json({
          success: true,
          user,
          count,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    //  ফাউন্ডার ড্যাশবোর্ডের রিয়েল-টাইম ডাটা কাউন্ট এপিআই (GET API)
    app.get("/api/founder/stats", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        // ১. Founder-এর সব Opportunity বের করো
        const opportunities = await opportunityCollection
          .find({ founderEmail: email })
          .toArray();

        const totalOpportunities = opportunities.length;

        const opportunityIds = opportunities.map((opp) => opp._id);

        // ২. ঐ Opportunity-গুলোর মোট Application
        const totalApplications = await applicationCollection.countDocuments({
          opportunityId: {
            $in: opportunityIds,
          },
        });

        // ৩. Accepted Members
        const acceptedMembers = await applicationCollection.countDocuments({
          opportunityId: {
            $in: opportunityIds,
          },
          status: "Accepted",
        });

        res.json({
          success: true,
          data: {
            totalOpportunities,
            totalApplications,
            acceptedMembers,
          },
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    //  সব স্টার্টআপ কার্ড আকারে দেখানোর জন্য (GET API)
    app.get("/api/public/startups", async (req, res) => {
      try {
        const { email } = req.query;

        const query = {
          $or: [{ status: "approved" }],
        };

        if (email) {
          query.$or.push({
            founderEmail: email,
          });
        }

        const startups = await startupCollection
          .find(query)
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          data: startups,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    //  আইডি দিয়ে নির্দিষ্ট স্টার্টআপের ডিটেইলস দেখা (GET API)
    app.get("/api/public/startups/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid Startup ID format" });
        }
        const startup = await startupCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!startup) {
          return res
            .status(404)
            .json({ success: false, message: "Startup not found" });
        }
        res.status(200).json({ success: true, data: startup });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  আইডি দিয়ে নির্দিষ্ট অপরচুনিটির ডিটেইলস দেখা (GET API)
    app.get("/api/public/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid Opportunity ID format" });
        }
        const opportunity = await opportunityCollection.findOne({
          _id: new ObjectId(id),
        });
        if (!opportunity) {
          return res
            .status(404)
            .json({ success: false, message: "Opportunity not found" });
        }
        res.status(200).json({ success: true, data: opportunity });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  নতুন স্টার্টআপ তৈরি করা (POST API)
    app.post("/api/startups", async (req, res) => {
      try {
        const startupData = req.body;
        const existingStartup = await startupCollection.findOne({
          founderEmail: startupData.founderEmail,
        });
        if (existingStartup) {
          return res.status(400).json({
            success: false,
            message: "You already have a startup registered!",
          });
        }
        startupData.createdAt = new Date();
        const result = await startupCollection.insertOne(startupData);
        const savedStartup = await startupCollection.findOne({
          _id: result.insertedId,
        });
        res.status(201).json({ success: true, data: savedStartup });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  সেশন ইমেইল দিয়ে স্টার্টআপ খুঁজে বের করা (GET API)
    app.get("/api/startups/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const startup = await startupCollection.findOne({
          founderEmail: email,
        });
        if (!startup) {
          return res
            .status(404)
            .json({ success: false, message: "Startup not found" });
        }
        res.status(200).json({ success: true, data: startup });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  আইডি দিয়ে স্টার্টআপ প্রোফাইল আপডেট করা (PUT API)
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
            updatedAt: new Date(),
          },
        };

        const result = await startupCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 1) {
          const updatedStartup = await startupCollection.findOne(filter);
          res.status(200).json({ success: true, data: updatedStartup });
        } else {
          res
            .status(404)
            .json({ success: false, message: "Startup not found to update" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  আইডি দিয়ে স্টার্টআপ প্রোফাইল ডিলিট করা (DELETE API)
    app.delete("/api/startups/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await startupCollection.deleteOne(query);
        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Startup profile deleted successfully",
          });
        } else {
          res
            .status(404)
            .json({ success: false, message: "No startup found with this ID" });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  নতুন অপরচুনিটি তৈরি করা (POST API)
    // নতুন অপরচুনিটি তৈরি করা (POST API)
    app.post("/api/opportunities", async (req, res) => {
      try {
        const opportunityData = req.body;

        const newOpportunity = {
          roleTitle: opportunityData.roleTitle,
          requiredSkills: opportunityData.requiredSkills,
          workType: opportunityData.workType,
          commitmentLevel: opportunityData.commitmentLevel,
          deadline: opportunityData.deadline,
          userId: opportunityData.userId,
          founderEmail:
            opportunityData.founderEmail || opportunityData.email || null,
          startupId: opportunityData.startupId
            ? new ObjectId(opportunityData.startupId)
            : null,
          createdAt: new Date(),
        };

        const result = await opportunityCollection.insertOne(newOpportunity);

        const savedOpportunity = await opportunityCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).json({
          success: true,
          data: savedOpportunity,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Get all opportunities
    app.get("/api/opportunities", async (req, res) => {
  try {
    const { search, workType, commitmentLevel } = req.query;
    let query = {};

    // ১. Role Title এবং Required Skills এর ওপর ভিত্তি করে $regex দিয়ে কেস-ইনসেন্সিটিভ সার্চ
    if (search) {
      query.$or = [
        { roleTitle: { $regex: search, $options: "i" } },
        { requiredSkills: { $regex: search, $options: "i" } }
      ];
    }

    // ২. Work Type এর ওপর ভিত্তি করে $in ফিল্টার
    if (workType) {
      const workTypesArray = workType.split(",");
      query.workType = { $in: workTypesArray };
    }

    // ৩. Commitment Level এর ওপর ভিত্তি করে $in ফিল্টার
    if (commitmentLevel) {
      const commitmentsArray = commitmentLevel.split(",");
      query.commitmentLevel = { $in: commitmentsArray };
    }

    const opportunities = await opportunityCollection
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json({
      success: true,
      data: opportunities,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
});

    // Logged-in user's opportunities
    app.get("/api/opportunities/user/:userId", async (req, res) => {
      try {
        const { userId } = req.params;

        const opportunities = await opportunityCollection
          .find({ userId })
          .sort({ createdAt: -1 })
          .toArray();

        res.status(200).json({
          success: true,
          data: opportunities,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    //  আইডি দিয়ে অপরচুনিটি আপডেট করা (PUT API)
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
            updatedAt: new Date(),
          },
        };

        const result = await opportunityCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 1) {
          const latestData = await opportunityCollection.findOne(filter);
          res.status(200).json({ success: true, data: latestData });
        } else {
          res.status(404).json({
            success: false,
            message: "Opportunity not found to update",
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  আইডি দিয়ে অপরচুনিটি ডিলিট করা (DELETE API)
    app.delete("/api/opportunities/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const query = { _id: new ObjectId(id) };
        const result = await opportunityCollection.deleteOne(query);
        if (result.deletedCount === 1) {
          res.status(200).json({
            success: true,
            message: "Opportunity deleted successfully",
          });
        } else {
          res.status(404).json({
            success: false,
            message: "Opportunity not found to delete",
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  কোলাবোরেটরের নতুন অ্যাপ্লিকেশন সাবমিট করা (POST API)
    app.post("/api/applications", async (req, res) => {
      try {
        const applicationData = req.body;

        // 🔹 User check
        const user = await userCollection.findOne({
          email: applicationData.applicantEmail,
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // 🔹 Only collaborators can apply
        if (user.role?.toLowerCase() !== "collaborator") {
          return res.status(403).json({
            success: false,
            message: "Only collaborators can apply for opportunities.",
          });
        }

        // 🔹 Duplicate check
        const alreadyApplied = await applicationCollection.findOne({
          opportunityId: new ObjectId(applicationData.opportunityId),
          applicantEmail: applicationData.applicantEmail,
        });

        if (alreadyApplied) {
          return res.status(400).json({
            success: false,
            message: "You have already applied for this opportunity.",
          });
        }

        // Save application
        const newApplication = {
          opportunityId: new ObjectId(applicationData.opportunityId),
          startupId: applicationData.startupId
            ? new ObjectId(applicationData.startupId)
            : null,
          roleTitle: applicationData.roleTitle,
          founderEmail: applicationData.founderEmail,
          applicantEmail: applicationData.applicantEmail,
          portfolioLink: applicationData.portfolioLink,
          motivationMessage: applicationData.motivationMessage,
          status: "Pending",
          appliedAt: new Date(),
        };

        const result = await applicationCollection.insertOne(newApplication);

        const savedApplication = await applicationCollection.findOne({
          _id: result.insertedId,
        });

        res.status(201).json({
          success: true,
          data: savedApplication,
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    //  সব অ্যাপ্লিকেশন বা নির্দিষ্ট অপরচুনিটির অ্যাপ্লিকেশন গেট করা (GET API)
    app.get("/api/applications", async (req, res) => {
      try {
        console.log("Query:", req.query);

        const { founderEmail, applicantEmail, opportunityId } = req.query;

        let query = {};

        if (founderEmail) {
          query.founderEmail = founderEmail;
        }

        if (applicantEmail) {
          query.applicantEmail = applicantEmail;
        }

        if (opportunityId) {
          query.opportunityId = new ObjectId(opportunityId);
        }

        console.log("Mongo Query:", query);

        const applications = await applicationCollection
          .aggregate([
            {
              $match: query,
            },

            {
              $lookup: {
                from: "startups",
                localField: "startupId",
                foreignField: "_id",
                as: "startupDetails",
              },
            },

            {
              $unwind: {
                path: "$startupDetails",
                preserveNullAndEmptyArrays: true,
              },
            },

            {
              $lookup: {
                from: "opportunities",
                localField: "opportunityId",
                foreignField: "_id",
                as: "opportunityDetails",
              },
            },

            {
              $unwind: {
                path: "$opportunityDetails",
                preserveNullAndEmptyArrays: true,
              },
            },

            {
              $sort: {
                appliedAt: -1,
              },
            },
          ])
          .toArray();

        console.log("Applications Found:", applications.length);

        res.json({
          success: true,
          data: applications,
        });
      } catch (err) {
        console.log(err);
      }
    });

    //  আইডি দিয়ে নির্দিষ্ট অ্যাপ্লিকেশনের স্ট্যাটাস আপডেট করা (PUT API)
    app.put("/api/applications/:id", async (req, res) => {
      try {
        const id = req.params.id;
        const { status } = req.body;

        if (!ObjectId.isValid(id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid Application ID format" });
        }

        const filter = { _id: new ObjectId(id) };
        const updateDoc = {
          $set: {
            status: status,
            updatedAt: new Date(),
          },
        };

        const result = await applicationCollection.updateOne(filter, updateDoc);
        if (result.matchedCount === 1) {
          const updatedApplication =
            await applicationCollection.findOne(filter);
          res.status(200).json({ success: true, data: updatedApplication });
        } else {
          res.status(404).json({
            success: false,
            message: "Application not found to update",
          });
        }
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  ইমেইল অনুযায়ী সব অ্যাপ্লিকেশন গেট করা
    app.get("/api/applications/:email", async (req, res) => {
      try {
        const email = req.params.email;

        const userApplications = await applicationCollection
          .aggregate([
            {
              $match: {
                $or: [{ applicantEmail: email }, { founderEmail: email }],
              },
            },
            {
              $lookup: {
                from: "opportunities",
                localField: "opportunityId",
                foreignField: "_id",
                as: "opportunityDetails",
              },
            },
            {
              $unwind: {
                path: "$opportunityDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
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
                          { $eq: ["$founderEmail", "$$fEmail"] },
                        ],
                      },
                    },
                  },
                ],
                as: "startupDetails",
              },
            },
            {
              $unwind: {
                path: "$startupDetails",
                preserveNullAndEmptyArrays: true,
              },
            },
            { $sort: { appliedAt: -1 } },
          ])
          .toArray();

        res.status(200).json({ success: true, data: userApplications });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  ইমেইল দিয়ে প্রোফাইল ডাটা গেট করা (GET API)
    app.get("/api/profile/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const userProfile = await userCollection.findOne({ email: email });
        if (!userProfile) {
          return res
            .status(404)
            .json({ success: false, message: "User profile not found" });
        }
        res.status(200).json({ success: true, data: userProfile });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    //  ইমেইল দিয়ে প্রোফাইল আপডেট করা (PUT API)
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
            updatedAt: new Date(),
          },
        };

        await userCollection.updateOne(filter, updateDoc, { upsert: true });
        const latestProfile = await userCollection.findOne(filter);
        res.status(200).json({ success: true, data: latestProfile });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/admin/users", async (req, res) => {
      try {
        const users = await userCollection.find().toArray();

        res.json({
          success: true,
          data: users,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    app.get("/api/auth/check-user-status", async (req, res) => {
      try {
        const { email } = req.query;

        const user = await userCollection.findOne({ email });

        if (!user) {
          return res.json({
            success: false,
            message: "User not found",
          });
        }

        if (user.status === "blocked") {
          return res.json({
            success: false,
            blocked: true,
          });
        }

        return res.json({
          success: true,
          blocked: false,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    app.patch("/api/admin/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        await userCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status,
            },
          },
        );

        res.json({
          success: true,
          message: "User updated successfully",
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    app.patch("/api/admin/users/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          {
            $set: {
              status,
            },
          },
        );

        res.json({
          success: true,
          message: `User ${status} successfully`,
          result,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // Admin dashboard এর জন্য সব স্টার্টআপের লিস্ট দেখানোর এপিআই তৈরি করা
    app.get("/api/admin/startups", async (req, res) => {
      try {
        const startups = await startupCollection
          .find()
          .sort({ createdAt: -1 })
          .toArray();

        res.json({
          success: true,
          data: startups,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // Admin dashboard এর জন্য স্টার্টআপের স্ট্যাটাস approved করার এপিআই তৈরি করা
    app.patch("/api/admin/startups/:id/approve", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await startupCollection.updateOne(
          {
            _id: new ObjectId(id),
          },
          {
            $set: {
              status: "approved",
            },
          },
        );

        res.json({
          success: true,
          result,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // remove sratup এর জন্য স্টার্টআপের স্ট্যাটাস rejected করার এপিআই তৈরি করা
    app.delete("/api/admin/startups/:id", async (req, res) => {
      try {
        const { id } = req.params;

        const result = await startupCollection.deleteOne({
          _id: new ObjectId(id),
        });

        res.json({
          success: true,
          result,
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // charts
    app.get("/api/admin/charts", async (req, res) => {
      try {
        // User Roles
        const founder = await userCollection.countDocuments({
          role: "founder",
        });

        const collaborator = await userCollection.countDocuments({
          role: "collaborator",
        });

        const admin = await userCollection.countDocuments({
          role: "admin",
        });

        // Startup Status
        const approved = await startupCollection.countDocuments({
          status: "approved",
        });

        const pending = await startupCollection.countDocuments({
          status: "pending",
        });

        // Revenue Trend (শেষ 7টি Payment)
        const revenueTrend = await subscriptionCollection
          .find({})
          .sort({ createdAt: 1 })
          .toArray();

        const revenue = revenueTrend.map((item) => ({
          date: new Date(item.createdAt).toLocaleDateString("en-GB", {
            day: "2-digit",
            month: "short",
          }),
          revenue: item.amount,
        }));

        // Opportunity Growth
        const opportunityTrend = await opportunityCollection
          .find({})
          .sort({ createdAt: 1 })
          .toArray();

        const opportunities = opportunityTrend.map((item, index) => ({
          name: index + 1,
          total: index + 1,
        }));

        res.json({
          success: true,
          data: {
            roles: [
              { name: "Founder", value: founder },
              { name: "Collaborator", value: collaborator },
              { name: "Admin", value: admin },
            ],

            startups: [
              { name: "Approved", total: approved },
              { name: "Pending", total: pending },
            ],

            revenue,
            opportunities,
          },
        });
      } catch (err) {
        res.status(500).json({
          success: false,
          message: err.message,
        });
      }
    });

    // সার্ভার লিসেনিং অবশ্যই run() ফাংশনের ভেতরে রাখতে হবে যাতে ডাটাবেজ কানেক্ট হওয়ার পরই পোর্ট ওপেন হয়
    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);
