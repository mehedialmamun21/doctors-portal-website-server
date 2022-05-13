const express = require('express')
const cors = require('cors');
require('dotenv').config();
const { MongoClient, ServerApiVersion } = require('mongodb');

const app = express()
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pfepv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

console.log(uri);


app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})