const express = require('express');
const cors = require('cors');
const SSLCommerzPayment = require('sslcommerz-lts')
const port = process.env.PORT || 5000;
require('dotenv').config();

const app = express();

//middleware
app.use(cors());
app.use(express.json());

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.efsdsdy.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

const store_id = process.env.BKASH_SID
const store_passwd = process.env.BKASH_SPASS
const is_live = false //true for live, false for sandbox

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");

    const productsCollection = client.db('petCare').collection('products');
    const usersCollection = client.db('petCare').collection('users');
    const appointmentOptionCollection = client.db('petCare').collection('appointmentOption');
    const cartsCollection = client.db('petCare').collection('carts');
    const bookingsCollection = client.db('petCare').collection('bookings')


    app.get('/products', async (req, res) => {
      await client.connect()
      const query = {};
      const products = await productsCollection.find(query).toArray();
      res.send(products);
    })

    app.get('/products/:id', async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const product = await productsCollection.findOne(query);
      res.send(product);
    });

    //appointment Related code

    app.get('/appointmentOption', async (req, res) => {
      await client.connect();
      const query = {};
      const result = await appointmentOptionCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/appointmentOption/:id', async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await appointmentOptionCollection.findOne(query);
      res.send(result);
    });

    const tranId = new ObjectId().toString();

    app.post('/bookings', async (req, res) => {
      await client.connect()
      const booking = req.body;
      console.log(booking);
      const query = {
        appointmentDate: booking.appointmentDate,
        email: booking.email,
        treatment: booking.treatment
      }
      const alreadyBooked = await bookingsCollection.find(query).toArray();
      if (alreadyBooked.length) {
        const message = `You already have an booking on ${booking.appointmentDate}`
        return res.send({ acknowledged: false, message });
      }

      const data = {
        total_amount: booking.prices,
        currency: 'BDT',
        tran_id: tranId, // use unique tran_id for each api call
        success_url: `http://localhost:5000/payment/success/${tranId}`,
        fail_url: 'http://localhost:3030/fail',
        cancel_url: 'http://localhost:3030/cancel',
        ipn_url: 'http://localhost:3030/ipn',
        shipping_method: 'Courier',
        product_name: 'Computer.',
        product_category: 'Electronic',
        product_profile: booking.doctorEmail,
        cus_name: booking.patient,
        cus_email: booking.email,
        cus_add1: 'Dhaka',
        cus_add2: 'Dhaka',
        cus_city: 'Dhaka',
        cus_state: 'Dhaka',
        cus_postcode: '1000',
        cus_country: 'Bangladesh',
        cus_phone: booking.phone,
        cus_fax: '01711111111',
        ship_name: 'Customer Name',
        ship_add1: 'Dhaka',
        ship_add2: 'Dhaka',
        ship_city: 'Dhaka',
        ship_state: 'Dhaka',
        ship_postcode: 1000,
        ship_country: 'Bangladesh',
      };
      const sslcz = new SSLCommerzPayment(store_id, store_passwd, is_live)
      sslcz.init(data).then(apiResponse => {
        // Redirect the user to payment gateway
        let GatewayPageURL = apiResponse.GatewayPageURL
        res.send({ url: GatewayPageURL })
        const finalBooking = {
          booking,
          tranjectionId: tranId,
          paymentStatus: false
        }
        const result = bookingsCollection.insertOne(finalBooking)
        console.log('Redirecting to: ', GatewayPageURL)
      });

      app.post('/payment/success/:tranId', async (req, res) => {
        await client.connect();
        const result = await bookingsCollection.updateOne(
          { tranjectionId: req.params.tranId },
          {
            $set: {
              paymentStatus: true
            },
          }
        );
        if(result.modifiedCount > 0){
          res.redirect(`http://localhost:3000/appointmentPayment/success/:${req.params.tranId}`)
        }
        return res.send()
      })
    })


    //product related code
    app.post('/carts', async (req, res) => {
      await client.connect()
      const cart = req.body;
      const result = await cartsCollection.insertOne(cart);
      res.send(result)
    })

    app.get('/carts', async (req, res) => {
      await client.connect()
      const email = req.query.email;
      const query = { customerEmail: email }
      const result = await cartsCollection.find(query).toArray()
      res.send(result)
    })

    //user related code
    app.get('/users', async (req, res) => {
      await client.connect();
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    app.post('/users', async (req, res) => {
      await client.connect();
      const user = req.body;
      const result = await usersCollection.insertOne(user);
      res.send(result);
    })

  } finally {
    // Ensures that the client will close when you finish/error
    await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.listen(port, () => {
  console.log(`Example app listening on port ${port}`)
})