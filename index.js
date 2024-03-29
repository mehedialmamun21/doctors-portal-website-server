const express = require('express')
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const app = express()

// running in port number 5000
const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());

// mongoDb connected with secure username and password
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.pfepv.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;

const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

// JWT verification
function verifyJWT(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'unAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden Access' })
        }
        req.decoded = decoded;
        next();
    });
}

async function run() {
    try {
        await client.connect();

        const serviceCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const reviewCollection = client.db('doctors_portal').collection('reviews');
        const paymentCollection = client.db('doctors_portal').collection('payments');
        const menuCollection = client.db('doctors_portal').collection('menu');
        const cartCollection = client.db('doctors_portal').collection('carts');

        // admin verification
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else {
                res.status(403).send({ message: 'forbidden' });
            }
        }

        // Get Menu Items
        app.get('/menu', async (req, res) => {
            const result = await menuCollection.find().toArray();
            res.send(result);
        })

        // Post Menu Items
        app.post('/menu', verifyJWT, verifyAdmin, async (req, res) => {
            const newItem = req.body;
            const result = await menuCollection.insertOne(newItem);
            res.send(result);
        })

        // Delete Menu Items
        app.delete('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await menuCollection.deleteOne(query);
            res.send(result);
        })

        // Update Menu Items
        app.put('/menu/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const updatedItem = req.body; // The updated item data
            const updateResult = await menuCollection.updateOne(query, { $set: updatedItem });

            if (updateResult.modifiedCount > 0) {
                res.send({ message: 'Item updated successfully' });
            } else {
                res.status(404).send({ error: 'Item not found' });
            }
        });


        // Cart Collection
        app.get('/carts', async (req, res) => {
            const email = req.query.email;
            if (!email) {
                res.send([]);
            }
            const query = { email: email };
            const result = await cartCollection.find(query).toArray();
            res.send(result);
        });

        app.post('/carts', async (req, res) => {
            const item = req.body;
            // console.log(item);
            const result = await cartCollection.insertOne(item);
            res.send(result);
        })

        app.delete('/carts/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) };
            const result = await cartCollection.deleteOne(query);
            res.send(result);
        });


        // Route to update the quantity of an item in the cart
        app.patch('/carts/:id', async (req, res) => {
            const itemId = req.params.id;
            const updatedQuantity = req.body.quantity;

            const query = { _id: new ObjectId(itemId) };

            try {
                const itemToUpdate = await cartCollection.findOne(query);
                if (!itemToUpdate) {
                    return res.status(404).json({ message: 'Item not found' });
                }

                // Update the item's quantity
                await cartCollection.updateOne(query, { $set: { quantity: updatedQuantity } });

                // Recalculate the total price
                const cart = await cartCollection.find({}).toArray();
                const total = cart.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);

                res.json({
                    message: 'Quantity updated',
                    updatedItem: itemToUpdate,
                    total,
                });
            } catch (error) {
                console.error('Error updating quantity:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        // create payment intent

        app.post('/create-payment-intent', verifyJWT, async (req, res) => {
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'usd',
                payment_method_types: ['card']
            });
            res.send({ clientSecret: paymentIntent.client_secret })
        });

        // Get all Service
        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = serviceCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })

        // POST review
        app.post('/review', async (req, res) => {
            const newReview = req.body;
            const result = await reviewCollection.insertOne(newReview);
            res.send(result);
        })

        // GET review
        app.get('/review', async (req, res) => {
            const query = {};
            const cursor = reviewCollection.find(query);
            const reviews = await cursor.toArray();
            res.send(reviews);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        })

        app.delete('/user/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await userCollection.deleteOne(filter);
            res.send(result);
        })

        app.get('/admin/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email });
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // To give "admin role" by Admin

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // To give "doctor role" by Admin

        app.put('/user/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const updateDoc = {
                $set: { role: 'doctor' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        });


        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' })
            res.send({ result, token });
        })


        // Add a new route to check if a user is a doctor
        app.get('/checkDoctorRole/:email', async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email });
            if (!user) {
                return res.status(404).json({ message: 'User not found' });
            }

            // Check if the user has the role of a doctor
            if (user.role === 'doctor') {
                res.json({ isDoctor: true });
            } else {
                res.json({ isDoctor: false });
            }
        });


        // To show all appointment details in Admin portal and Doctor Profile
        app.get('/api/appointments', async (req, res) => {
            try {
                const appointments = await bookingCollection.find().toArray();
                res.json(appointments);
            } catch (error) {
                console.error('Error fetching appointments:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });



        app.get('/available', async (req, res) => {
            const date = req.query.date;
            const services = await serviceCollection.find().toArray();
            const query = { date: date }
            const bookings = await bookingCollection.find(query).toArray();
            services.forEach(service => {
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                const bookedSlots = serviceBookings.map(book => book.slot);
                const available = service.slots.filter(slot => !bookedSlots.includes(slot));
                service.slots = available;
            });
            res.send(services);
        })

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'forbidden access' });
            }
        })

        app.get('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {

            const booking = req.body;  // post data remains in body & it is from client side.

            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.patch('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const payment = req.body;
            const filter = { _id: ObjectId(id) };
            const updatedDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updatedDoc);
            res.send(updatedDoc);
        })

        app.get('/doctor', async (req, res) => {
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        })


        // prescription section

        app.get('/doctor/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };
            const doctor = await doctorCollection.findOne(query);
            res.send(doctor);
        });

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        })

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email };
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        })

        // To Delete Appointments from user 
        app.delete('/booking/:id', verifyJWT, async (req, res) => {
            const id = req.params.id;
            const query = { _id: ObjectId(id) };

            try {
                // Check if the appointment exists
                const appointment = await bookingCollection.findOne(query);
                if (!appointment) {
                    return res.status(404).json({ message: 'Appointment not found' });
                }

                // Check if the user trying to delete the appointment is the owner (patient)
                if (appointment.patient !== req.decoded.email) {
                    return res.status(403).json({ message: 'Forbidden access' });
                }

                // Delete the appointment
                const result = await bookingCollection.deleteOne(query);
                res.json({ message: 'Appointment deleted', deletedAppointment: appointment });
            } catch (error) {
                console.error('Error deleting appointment:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


    }

    finally {

    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Hello From Doctors Portal!')
})

// port listening
app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})