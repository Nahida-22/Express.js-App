const express = require("express");
const cors = require("cors");
const path = require("path");
const PropertiesReader = require("properties-reader");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const fs = require("fs"); 

const app = express();

app.use(cors());
app.use(express.json());


app.set("json spaces", 3);

//logs all incoming requests to the console
app.use(function(req, res, next) {
  console.log("Request IP: " + req.ip);
  console.log("Request date: " + new Date());
  console.log("Request method: " + req.method);
  console.log("Request URL: " + req.url);
  console.log("----------------------------------------");
  next();
});
//Static file serving middleware
app.use(function(req, res, next) {
  var filePath = path.join(__dirname, "public", req.url);
  
  fs.stat(filePath, function(err, fileInfo) {
    if (err) {
      next();
      return;
    }
    
    if (fileInfo.isFile()) {
      res.sendFile(filePath);
    } else {
      next();
    }
  });
});


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

// Fetch all documents
app.get("/api/lessons", async function (req, res) {
  try {
    const collection = db1.collection("Courses");

    console.log("Accessing collection: Courses");

    const results = await collection.find({}).toArray();
    console.log("Retrieved data:", results.length);

    res.status(200).json(results);
  } catch (err) {
    console.error("Error fetching data:", err);
    res.status(500).json({ error: "Failed to fetch data" });
  }
});

// Create new order (minimal fields, no client-side totals)
app.post("/api/order", async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phoneNumber,
      address,
      city,
      state,
      zip,
      method,
      gift,
      items, // [{ lessonID, title, location, image, price, quantity }]
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
      phoneNumber,
      address,
      city,
      state,
      zip,
      method,
      gift,
      items,
    };

    const ordersCol = db1.collection("Orders");
    const result = await ordersCol.insertOne(orderDoc);

    res.status(201).json({
      message: "Order placed successfully",
      orderId: result.insertedId,
    });
  } catch (err) {
    console.error("Create order failed:", err);
    res.status(500).json({ error: "Failed to create order" });
  }
});


//put route
app.put("/api/:collectionName/:id", async function (req, res, next) {
  try {
    console.log(
      "Received request to update quantity of lessons for lesson with id:",
      req.params.id
    );

    //Update a single document by id
    const data = req.body;

    const result = await req.collection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: data },
      { safe: true, multi: false }
    );
    console.log("Update operation result:", result);

    res.json(result.matchedCount === 1 ? { msg: "success" } : { msg: "error" });
  } catch (err) {
    console.error("Error updating document:", err.message);
    next(err);
  }
});

//GET ROUTE for Search
app.get("/api/search", async (req, res) => {
  try {
    //GET keyword from query string
    //if no keyword is provided, default is empty string
    const keyword = req.query.keyword || "";

    //Create a case-insensitive regular expression for fuzzy search
    const searchRegex = new RegExp(keyword, "i");

    //Query the collection "Courses"
    const results = await db1
      .collection("Courses")
      .find({
        $or: [
          { title: searchRegex }, //search title
          { description: searchRegex }, //search in description
          { location: searchRegex }, //search in location
          { price: searchRegex }, //search in price (converted automatically to string)
          { availableInventory: searchRegex }, //search in available spaces
        ],
      })
      .toArray();
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: "Search failed" });
  }
});

app.post("/api/signup", async(req,res) =>{
  try{
    const { firstName, lastName, email, password } = req.body || {};
    const usersCol = db1.collection("Users");
    // Check if email already exists
    const existing = await usersCol.findOne({ email });
    if (existing) {
      return res.status(409).json({ error: "Email is already registered." });
    }
    const userDoc = {
      firstName,
      lastName,
      email,
      password
    };

    const results = await usersCol.insertOne(userDoc);
    res.json(results);
  } catch (err){
    console.error('Error inserting: ', err.message);
    
  }

});
//Sign In route
app.post("/api/signin", async(req,res)=>{
  try{
    const {email,password}=req.body || {};
     if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }
    const usersCol = db1.collection("Users");
    const user = await usersCol.findOne({ email });
    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid email or password." });
    }
    return res.json({
      message: "Login successful",
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName || "",
        lastName:  user.lastName || "",
      }
    });
  } catch (err){
      
    console.error("Signin failed:", err);
    return res.status(500).json({ error: "Signin failed." });
  }
  
 
});

// 404 handler for unmatched routes
app.use(function(req, res) {
  res.status(404);
  res.send("File not found!");
});
//Global error handler
app.use((err, req, res, next) => {
  console.error("Global error handler:", err);
  res.status(500).json({ error: "An error occurred" });
});
