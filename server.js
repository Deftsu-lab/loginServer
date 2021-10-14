// mongodb
require("./config/db");

const deeplink = require("node-deeplink");
const app = require("express")();
const port = process.env.PORT || 5000;

//cors
const cors = require("cors");
app.use(cors());

const UserRouter = require("./api/User");

// For accepting post form data
const bodyParser = require("express").json;
app.use(bodyParser());

app.use("/user", UserRouter);

app.get(
    "resetUrl", 
    deeplink({
      //fallback: "seite muss noch"
      //android_package_name:
      //ios_store_link: 
    }));

app.listen(port, () => {
	console.log(`Server running on port ${port}`);
});
