const express = require("express");
const cors = require("cors");
const path = require("path");
const PropertiesReader = require("properties-reader");
const { MongoClient, ServerApiVersion } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());
app.set("json spaces", 3);

//Load properties
let propertiesPath = path.resolve(__dirname, "./dbconnection.properties");
let properties = PropertiesReader(propertiesPath);

//Build URI
const dbPrefix = properties.get("db.prefix");
const dbHost = properties.get("db.host");
const dbName = properties.get("db.name");
const dbUser = properties.get("db.user");
const dbPassword = properties.get("db.password");
const dbParams = properties.get("db.params");

const uri = `${dbPrefix}${dbUser}:${dbPassword}${dbHost}${dbParams}`;
const client = new MongoClient(uri, { serverApi: ServerApiVersion.v1 });

let db1; //global reference

//Connect before listening
async function connectDB() {
  try {
    await client.connect(); //await connection
    db1 = client.db("VueCourseworkLessons");
    console.log("Connected to MongoDB");

    //start server only after connection
    app.listen(3000, () => console.log("Server running on port 3000"));
  } catch (err) {
    console.error("MongoDB connection error:", err);
  }
}

connectDB();

//Middleware for dynamic collection
app.param("collectionName", function (req, res, next, collectionName) {
  try {
    req.collection = db1.collection(collectionName);
    console.log("Middleware set collection:", req.collection.collectionName);
    next();
  } catch (err) {
    next(err);
  }
});

//Fetch all documents
app.get("/api/:collectionName", async function (req, res) {
  try {
    console.log("Received request for:", req.params.collectionName);
    console.log("Accessing collection:", req.collection.collectionName);

    const results = await req.collection.find({}).toArray();
    console.log("Retrieved data:", results.length);
    res.status(200).json(results);
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Create new order (minimal fields, no client-side totals)
app.post("/api/orders", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      address,
      city,
      state,
      zip,
      phoneNumber,
      method,
      gift,
      items // [{ lessonID, title, location, image, price, quantity }]
    } = req.body || {};

    // Basic validation
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: "Cart items missing" });
    }
    if (!firstName || !lastName || !address || !city || !state || !zip) {
      return res.status(400).json({ error: "Address details incomplete" });
    }

    // Build order 
    const orderDoc = {
      firstName,
      lastName,
      address,
      city,
      state,
      zip,
      phoneNumber,
      method,
      gift,
      items
    };

    const ordersCol = db1.collection("Orders");
    const result = await ordersCol.insertOne(orderDoc);

    res.status(201).json({
      message: "Order placed successfully",
      orderId: result.insertedId
    });
  } catch (err) {
    console.error("Create order failed:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});



//Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ error: "An error occurred" });
});
