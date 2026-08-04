const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 5000;
require("dotenv").config();

const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const { createRemoteJWKSet, jwtVerify } = require("jose-cjs");

app.use(
  cors({
    origin: "*",
  }),
);
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
    // await client.connect();
    console.log("Connected successfully to MongoDB!");

    const database = client.db("startupforge_db_user");
    const startupCollection = database.collection("startups");
    const opportunityCollection = database.collection("opportunities");
    const applicationCollection = database.collection("applications");
    const userCollection = database.collection("user");
    const subscriptionCollection = database.collection("subscriptions");

    const JWKS = createRemoteJWKSet(
      new URL(`${process.env.CLIENT_URL}/api/auth/jwks`),
    );

    // middleware
    // const verifyToken = async (req, res, next) => {
    //   try {
    //     const authHeader = req.headers.authorization;

    //     if (!authHeader) {
    //       return res.status(401).json({
    //         success: false,
    //         message: "Unauthorized. No token provided.",
    //       });
    //     }

    //     const token = authHeader.split(" ")[1];

    //     console.log("TOKEN:", token);

    //     // JWT Verify
    //     const { payload } = await jwtVerify(token, JWKS);

    //     // পরবর্তীতে ব্যবহার করার জন্য payload req তে রেখে দিচ্ছি
    //     req.user = payload;

    //     next();
    //   } catch (error) {
    //     console.error("Token verification failed:", error);

    //     return res.status(401).json({
    //       success: false,
    //       message: "Invalid or expired token.",
    //     });
    //   }
    // };

    //  Role-based middleware
    // const verifyRole = (allowedRoles) => {
    //   return async (req, res, next) => {
    //     try {
    //       // req.user থেকে ইমেইল বা আইডি পাওয়া যাবে (আপনার payload এ কি দিয়ে ইউজার আইডেন্টিফাই করা হয় চেক করে নেবেন, যেমন: req.user.email বা req.user.id)
    //       const email = req.user?.email;

    //       if (!email) {
    //         return res.status(401).json({
    //           success: false,
    //           message: "Unauthorized. User info not found in token.",
    //         });
    //       }

    //       // ডাটাবেজ থেকে ইউজার খুঁজে বের করা
    //       const user = await userCollection.findOne({ email });

    //       if (!user) {
    //         return res.status(404).json({
    //           success: false,
    //           message: "User not found in database.",
    //         });
    //       }

    //       // ইউজারের রোল অনুমোদিত তালিকার (allowedRoles) মধ্যে আছে কিনা চেক করা
    //       if (!allowedRoles.includes(user.role)) {
    //         return res.status(403).json({
    //           success: false,
    //           message: "Forbidden! You do not have permission to perform this action.",
    //         });
    //       }

    //       // রোল মিলে গেলে রিকোয়েস্ট সামনে এগোবে
    //       next();
    //     } catch (error) {
    //       console.error("Role verification failed:", error);
    //       return res.status(500).json({
    //         success: false,
    //         message: error.message,
    //       });
    //     }
    //   };
    // };

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
    app.patch(
      "/api/admin/startups/:id/status",

      async (req, res) => {
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
      },
    );

    // transaction history api
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

    // app.get("/api/founder/stats", async (req, res) => {
    //   try {
    //     const { email } = req.query;

    //     if (!email) {
    //       return res.status(400).json({
    //         success: false,
    //         message: "Founder email is required",
    //       });
    //     }

    //     // ১. Founder-এর সব Opportunity বের করো
    //     const opportunities = await opportunityCollection
    //       .find({ founderEmail: email })
    //       .toArray();

    //     const totalOpportunities = opportunities.length;

    //     const opportunityIds = opportunities.map((opp) => opp._id);

    //     // ২. ঐ Opportunity-গুলোর মোট Application
    //     const totalApplications = await applicationCollection.countDocuments({
    //       opportunityId: {
    //         $in: opportunityIds,
    //       },
    //     });

    //     // profile

    //     // ৩. Accepted Members
    //     const acceptedMembers = await applicationCollection.countDocuments({
    //       opportunityId: {
    //         $in: opportunityIds,
    //       },
    //       status: "Accepted",
    //     });

    //     res.json({
    //       success: true,
    //       data: {
    //         totalOpportunities,
    //         totalApplications,
    //         acceptedMembers,
    //       },
    //     });
    //   } catch (err) {
    //     res.status(500).json({
    //       success: false,
    //       message: err.message,
    //     });
    //   }
    // });

    app.get("/api/founder/stats", async (req, res) => {
      try {
        const { email } = req.query;

        if (!email) {
          return res.status(400).json({
            success: false,
            message: "Founder email is required",
          });
        }

        // Founder-এর সব Opportunity
        const opportunities = await opportunityCollection
          .find({ founderEmail: email })
          .toArray();

        const totalOpportunities = opportunities.length;
        const opportunityIds = opportunities.map((opp) => opp._id);

        // Founder-এর Startup
        const startup = await startupCollection.findOne({
          founderEmail: email,
        });

        // Opportunity + Startup দুইটার Application Count
        const totalApplications = await applicationCollection.countDocuments({
          $or: [
            {
              opportunityId: {
                $in: opportunityIds,
              },
            },
            ...(startup
              ? [
                  {
                    startupId: startup._id,
                  },
                ]
              : []),
          ],
        });

        // Opportunity + Startup দুইটার Accepted Members
        const acceptedMembers = await applicationCollection.countDocuments({
          status: "Accepted",
          $or: [
            {
              opportunityId: {
                $in: opportunityIds,
              },
            },
            ...(startup
              ? [
                  {
                    startupId: startup._id,
                  },
                ]
              : []),
          ],
        });

        res.status(200).json({
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

    app.get("/api/users/profile", async (req, res) => {
      try {
        const { email } = req.query;
        if (!email) {
          return res
            .status(400)
            .json({ success: false, message: "Email is required" });
        }
        const user = await userCollection.findOne({ email });
        if (!user) {
          return res
            .status(404)
            .json({ success: false, message: "User not found" });
        }
        res.status(200).json({ success: true, data: user });
      } catch (error) {
        res.status(500).json({ success: false, message: error.message });
      }
    });

    app.get("/api/public/startups", async (req, res) => {
      try {
        const { email, limit } = req.query;

        const query = {
          $or: [{ status: "approved" }],
        };

        if (email) {
          query.$or.push({
            founderEmail: email,
          });
        }

        let cursor = startupCollection.find(query).sort({ createdAt: -1 });

        if (limit) {
          cursor = cursor.limit(Number(limit));
        }

        const startups = await cursor.toArray();

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

    app.post("/api/startups", async (req, res) => {
      try {
        const startupData = req.body;
        // console.log("Startup Data:", startupData);
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

    // app.post("/api/opportunities", async (req, res) => {
    //   try {
    //     const opportunityData = req.body;

    //     // Founder-এর startup বের করো
    //     // const startup = await startupCollection.findOne({
    //     //   founderEmail: opportunityData.founderEmail,
    //     // });

    //     // if (!startup) {
    //     //   return res.status(404).json({
    //     //     success: false,
    //     //     message: "Startup not found for this founder.",
    //     //   });
    //     // }

    //     const newOpportunity = {
    //       roleTitle: opportunityData.roleTitle,
    //       requiredSkills: opportunityData.requiredSkills,
    //       workType: opportunityData.workType,
    //       commitmentLevel: opportunityData.commitmentLevel,
    //       deadline: opportunityData.deadline,

    //       userId: opportunityData.userId,
    //       founderEmail: opportunityData.founderEmail,

    //       // ✅ Startup ID backend থেকে সেট হবে
    //       startupId: startup._id,

    //       createdAt: new Date(),
    //     };

    //     const result = await opportunityCollection.insertOne(newOpportunity);

    //     const savedOpportunity = await opportunityCollection.findOne({
    //       _id: result.insertedId,
    //     });

    //     res.status(201).json({
    //       success: true,
    //       data: savedOpportunity,
    //     });
    //   } catch (error) {
    //     res.status(500).json({
    //       success: false,
    //       message: error.message,
    //     });
    //   }
    // });

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
          founderEmail: opportunityData.founderEmail,

          // Startup-এর সাথে সম্পর্ক নেই
          startupId: null,

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
        const {
          search,
          workType,
          commitmentLevel,
          page = 1,
          limit = 6,
        } = req.query;

        let query = {};

        // ১. Search using $regex
        if (search) {
          query.$or = [
            { roleTitle: { $regex: search, $options: "i" } },
            { requiredSkills: { $regex: search, $options: "i" } },
          ];
        }

        // ২. Work Type filter using $in
        if (workType) {
          const workTypesArray = workType.split(",");
          query.workType = { $in: workTypesArray };
        }

        // ৩. Commitment Level filter using $in
        if (commitmentLevel) {
          const commitmentsArray = commitmentLevel.split(",");
          query.commitmentLevel = { $in: commitmentsArray };
        }

        // Pagination
        const skip = (Number(page) - 1) * Number(limit);

        // Total data count
        const total = await opportunityCollection.countDocuments(query);

        // Get paginated data
        const opportunities = await opportunityCollection
          .find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(Number(limit))
          .toArray();

        res.status(200).json({
          success: true,
          data: opportunities,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            totalPages: Math.ceil(total / Number(limit)),
          },
        });
      } catch (error) {
        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

    // Logged-in user's opportunities
    app.get(
      "/api/opportunities/user/:userId",

      async (req, res) => {
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
      },
    );

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

    // app.post("/api/applications", async (req, res) => {
    //   try {
    //     const applicationData = req.body;
    //     console.log(applicationData);

    //     // 🔹 User check
    //     const user = await userCollection.findOne({
    //       email: applicationData.applicantEmail,
    //     });

    //     if (!user) {
    //       return res.status(404).json({
    //         success: false,
    //         message: "User not found.",
    //       });
    //     }

    //     // 🔹 Only collaborators can apply
    //     if (user.role?.toLowerCase() !== "collaborator") {
    //       return res.status(403).json({
    //         success: false,
    //         message: "Only collaborators can apply for opportunities.",
    //       });
    //     }

    //     // 🔹 Duplicate check
    //     const alreadyApplied = await applicationCollection.findOne({
    //       opportunityId: new ObjectId(applicationData.opportunityId),
    //       applicantEmail: applicationData.applicantEmail,
    //     });

    //     if (alreadyApplied) {
    //       return res.status(400).json({
    //         success: false,
    //         message: "You have already applied for this opportunity.",
    //       });
    //     }

    //     // Save application
    //     const newApplication = {

    //       opportunityId: new ObjectId(applicationData.opportunityId),
    //       startupId: applicationData.startupId
    //         ? new ObjectId(applicationData.startupId)
    //         : null,
    //       roleTitle: applicationData.roleTitle,
    //       founderEmail: applicationData.founderEmail,
    //       applicantEmail: applicationData.applicantEmail,
    //       portfolioLink: applicationData.portfolioLink,
    //       motivationMessage: applicationData.motivationMessage,
    //       status: "Pending",
    //       appliedAt: new Date(),
    //     };
    //     console.log(newApplication);

    //     const result = await applicationCollection.insertOne(newApplication);

    //     const savedApplication = await applicationCollection.findOne({
    //       _id: result.insertedId,
    //     });

    //     res.status(201).json({
    //       success: true,
    //       data: savedApplication,
    //     });
    //   } catch (error) {
    //     res.status(500).json({
    //       success: false,
    //       message: error.message,
    //     });
    //   }
    // });

    app.post("/api/applications", async (req, res) => {
      try {
        console.log("========== REQUEST BODY ==========");
        console.log(req.body);
        console.log("applicationType:", req.body.applicationType);
        console.log("startupId:", req.body.startupId);
        console.log("opportunityId:", req.body.opportunityId);
        const applicationData = req.body;
        console.log("applicationType:", applicationData.applicationType);

        // User check
        const user = await userCollection.findOne({
          email: applicationData.applicantEmail,
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            message: "User not found.",
          });
        }

        // Only collaborators can apply
        if (user.role?.toLowerCase() !== "collaborator") {
          return res.status(403).json({
            success: false,
            message: "Only collaborators can apply.",
          });
        }

        // Duplicate check
        let alreadyApplied;

        if (applicationData.applicationType === "startup") {
          alreadyApplied = await applicationCollection.findOne({
            startupId: new ObjectId(applicationData.startupId),
            applicantEmail: applicationData.applicantEmail,
            applicationType: "startup",
          });
        } else if (applicationData.applicationType === "opportunity") {
          alreadyApplied = await applicationCollection.findOne({
            opportunityId: new ObjectId(applicationData.opportunityId),
            applicantEmail: applicationData.applicantEmail,
            applicationType: "opportunity",
          });
        }

        if (alreadyApplied) {
          return res.status(400).json({
            success: false,
            message: "You have already applied.",
          });
        }

        // Save application
        const newApplication = {
          applicationType: applicationData.applicationType,

          startupId: applicationData.startupId
            ? new ObjectId(applicationData.startupId)
            : null,

          opportunityId: applicationData.opportunityId
            ? new ObjectId(applicationData.opportunityId)
            : null,

          roleTitle: applicationData.roleTitle || null,
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
        console.error(error);

        res.status(500).json({
          success: false,
          message: error.message,
        });
      }
    });

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

    app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection error:", error);
  }
}

run().catch(console.dir);
