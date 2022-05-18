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

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();

        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query);
            const services = await cursor.toArray();
            res.send(services);
        })

        // warning :
        // this is not the proper way to query.
        // After learning more about mongodb. use aggregate lookup, pipeline, match, group 

        app.get('/available', async (req, res) => {
            // const date = req.query.date || 'May 24, 2022';
            const date = req.query.date;

            // step 1 : get all services

            const services = await serviceCollection.find().toArray();

            // step 2 : get the booking of that day. output: [{}, {}, {}, {}, {}, {}]
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray();

            // step 3 : for each service
            services.forEach(service => {
                // step 4 : find bookings for that service. output: [{}, {}, {}, {}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                // step 5 : select slots for the service Bookings: ['','','','']
                const bookedSlots = serviceBookings.map(book => book.slot);
                // step 6 : select those slots that are not in bookedSlots
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                // step 7 : set available to slots to make it easier
                service.slots = available;
            });
            res.send(services);
        })


        /**
         * API Naming Convention  
         * app.get('/booking')  // get all bookings in this collection. Or, get more than one. Or, filter query
         * app.get('/booking/:id')  // get a specific booking
         * app.post('/booking')  // add a new booking (create operation chalano hocche ekhane)
         * app.patch('/booking/:id')  // update kora hocche specific 1 ta ke
         * app.delete('/booking/:id')
        */

        app.post('/booking', async (req, res) => {
            const booking = req.body;  // post er data body er moddhe thake // client side theke pathano
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        })

    }

    finally {

    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal!')
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})