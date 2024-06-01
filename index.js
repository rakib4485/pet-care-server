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
    const productOrderCollection = client.db('petCare').collection('productOrders');
    const sellersCollection = client.db('petCare').collection('sellers');
    const categoryCollection = client.db('petCare').collection('productCategories')


    app.get('/products', async (req, res) => {
      await client.connect()
      const categoryId = req.query.category;
      if (categoryId === '0') {
        const query = {};
        const products = await productsCollection.find(query).toArray();
        return res.send(products);
      } else {
        const query = { categoryId: categoryId }
        const products = await productsCollection.find(query).toArray();
        return res.send(products);
      }
    })

    app.get('/products/:id', async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const product = await productsCollection.findOne(query);
      res.send(product);
    });

    app.get('/categories', async (req, res) => {
      await client.connect()
      const query = {}
      const categories = await categoryCollection.find(query).toArray();
      res.send(categories);
    });

    app.post('/product', async (req, res) => {
      await client.connect()
      const product = req.body;
      const result = await productsCollection.insertOne(product);
      res.send(result)
    })

    app.get('/my-product', async (req, res) => {
      await client.connect()
      const email = req.query.email;
      const query = { sellerEmail: email };
      const result = await productsCollection.find(query).toArray();
      res.send(result)
    })

    app.get('/my-product-order', async (req, res) => {
      await client.connect()
      const email = req.query.email;
      const orders = await productOrderCollection.find({}).toArray();
      let myOrder = [];
      orders.forEach(order => {
        order.products.map(product => {
          if (JSON.stringify(product.sellerEmail) === JSON.stringify(email)) {
            const order1 = {
              product,
              name: order.name,
              price: order.price,
              city: order.city,
              street: order.street,
              paymentType: order.paymentType,
              customerEmail: order.customerEmail,
              phone: order.phone,
              orderDate: order.orderDate
            }
            myOrder = [...myOrder, order1]
          }
        })
      })
      res.send(myOrder)
    })

    //appointment Related code

    app.get('/appointmentOption', async (req, res) => {
      await client.connect();
      const query = {};
      const result = await appointmentOptionCollection.find(query).toArray();
      res.send(result);
    })



    app.post('/appointmentOptions', async (req, res) => {
      await client.connect()
      const appointmentOption = req.body;
      console.log(appointmentOption)
      const query = { email: appointmentOption.email };
      console.log(query)
      const already = await usersCollection.findOne(query);
      console.log(already)
      if (already) {
        const result = await appointmentOptionCollection.insertOne(appointmentOption);
        console.log(result)
        if (result.acknowledged) {
          const result1 = await usersCollection.updateOne(
            { email: appointmentOption.email },
            {
              $set: {
                role: 'doctor',
                doctorDetails: {}
              },
            }
          );
          return res.send(result1)
        }
      }

      res.send({ acknowledged: false });
    })

    app.get('/appointmentOption/:id', async (req, res) => {
      await client.connect();
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await appointmentOptionCollection.findOne(query);
      res.send(result);
    });

    app.get('/appointmentSlots/:email', async (req, res) => {
      await client.connect()
      const date = req.query.date;
      const email = req.params.email;
      const query = { email };
      const option = await appointmentOptionCollection.findOne(query);
      //get the booking of provided date
      const bookingQuery = {
        appointmentDate: date
      }
      const alreadyBooked = await bookingsCollection.find(bookingQuery).toArray();

      const optionBooked = alreadyBooked.filter(book => book.doctorEmail === option.email);
      const bookedSlots = optionBooked.map(book => book.slot);
      const remainingSlots = option.slots.filter(slot => !bookedSlots.includes(slot));
      option.slots = remainingSlots;
      res.send(option);
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
        success_url: `https://pet-care-server-lake.vercel.app/payment/success/${tranId}`,
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
          appointmentDate: booking.appointmentDate,
          tranjectionId: tranId,
          paymentStatus: false,
          treatment: booking.treatment,
          slot: booking.slot,
          patient: booking.patient,
          email: booking.email,
          doctorEmail: booking.doctorEmail,
          phone: booking.phone,
          prices: booking.prices,
          meet: booking.meet
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
        console.log(result)
        if (result.modifiedCount > 0) {
          res.redirect(`http://localhost:3000/appointmentPayment/success/:${req.params.tranId}`)
        }
        return res.send()
      })
    })

    app.get('/bookings', async (req, res) => {
      await client.connect();
      const email = req.query.email;
      const query = { email };
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/allBookings', async (req, res) => {
      await client.connect();
      const query = {};
      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });

    app.get('/my-appointments', async (req, res) =>{
      await client.connect()
      const email = req.query.email;
      const query = {doctorEmail: email}
      const result = await bookingsCollection.find(query).toArray()
      res.send(result);
    })




    //product related code

    // server.js

    // Route to fetch month-wise order quantities with formatted dates
    app.get('/api/monthly-orders', async (req, res) => {
      try {
        await client.connect()
        const monthlyOrders = await productOrderCollection.aggregate([
          {
            $group: {
              _id: {
                $dateToString: { format: "%B %Y", date: { $toDate: "$orderDate" } }
              },
              totalQuantity: { $sum: '$products[0].quantity' }
            }
          },
          {
            $sort: {
              '_id': 1
            }
          }
        ]).toArray();
        res.json(monthlyOrders);
      } catch (error) {
        console.error('Error fetching monthly orders:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

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

    app.post('/productOrder', async (req, res) => {
      await client.connect();
      const order = req.body;
      if (order.paymentType === 'online') {
        const data = {
          total_amount: order.price,
          currency: 'BDT',
          tran_id: tranId, // use unique tran_id for each api call
          success_url: `https://pet-care-server-lake.vercel.app/payment/success/${tranId}`,
          fail_url: 'http://localhost:3030/fail',
          cancel_url: 'http://localhost:3030/cancel',
          ipn_url: 'http://localhost:3030/ipn',
          shipping_method: 'Courier',
          product_name: 'Computer.',
          product_category: 'Electronic',
          product_profile: order.name,
          cus_name: order.name,
          cus_email: order.customerEmail,
          cus_add1: 'Dhaka',
          cus_add2: 'Dhaka',
          cus_city: 'Dhaka',
          cus_state: 'Dhaka',
          cus_postcode: '1000',
          cus_country: 'Bangladesh',
          cus_phone: order.phone,
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
          const finalOrder = {
            name: order.name,
            price: order.price,
            city: order.city,
            street: order.street,
            products: order.products,
            paymentType: order.paymentType,
            customerEmail: order.customerEmail,
            phone: order.phone,
            paymentStatus: false,
            tranjectionId: tranId,
            orderDate: order.orderDate
          }
          const result = productOrderCollection.insertOne(finalOrder)
          console.log('Redirecting to: ', GatewayPageURL)
        });

        app.post('/payment/success/:tranId', async (req, res) => {
          await client.connect();
          const result = await productOrderCollection.updateOne(
            { tranjectionId: req.params.tranId },
            {
              $set: {
                paymentStatus: true
              },
            }
          );
          if (result.modifiedCount > 0) {
            const del = await cartsCollection.deleteMany({ customerEmail: order.customerEmail });
            console.log(del)
            if (del.deletedCount > 0) {
              res.redirect(`http://localhost:3000/orderPayment/success/:${req.params.tranId}`)
            }

          }
          return res.send()
        })
      }
      else {
        const result = await productOrderCollection.insertOne(order);
        console.log(result)
        if (result.acknowledged) {
          const del = await cartsCollection.deleteMany({ customerEmail: order.customerEmail });
          console.log(del)
          if (del.deletedCount > 0) {
            return res.send({ acknowledged: true });
          }
        }

      }
    });

    app.get('/orders', async (req, res) => {
      await client.connect()
      const email = req.query.email;
      const query = { customerEmail: email };
      const order = await productOrderCollection.find(query).toArray()
      res.send(order)
    })

    app.get('/totalOrders', async (req, res) => {
      await client.connect()
      const query = {};
      const order = await productOrderCollection.find(query).toArray()
      res.send(order)
    })

    //user related code
    app.get('/users', async (req, res) => {
      await client.connect();
      const query = {};
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    })

    app.get('/user/:email', async (req, res) => {
      await client.connect()
      const email = req.params.email;
      const query = {email};
      const result = await usersCollection.findOne(query);
      res.send(result);
    })


    app.post('/users', async (req, res) => {
      await client.connect();
      const user = req.body;
      const query = { email: user.email };
      const already = await usersCollection.findOne(query);
      if (already) {
        return res.send({ acknowledged: false });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    app.put('/sellerRequest', async (req, res) => {
      await client.connect()
      const seller = req.body;
      const filter = { email: seller.email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          role: 'sellerRequest',
          sellerInfo: seller
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    });

    app.put('/edit-doctorDetails', async (req, res) => {
      await client.connect()
      const email = req.query.email
      const doctorDetails = req.body;
      console.log(doctorDetails)
      const filter = { email: email };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          doctorDetails
        }
      }
      const result = await usersCollection.updateOne(filter, updatedDoc, options);
      res.send(result);
    });

    app.get('/sellerRequest', async (req, res) => {
      await client.connect()
      const query = { role: 'sellerRequest' };
      const result = await usersCollection.find(query).toArray()
      res.send(result);
    });

    app.get('/sellerInfo', async (req, res) => {
      await client.connect()
      const email = req.query.email;
      const query = { email }
      const result = await usersCollection.findOne(query);
      res.send(result);
    })

    app.get('/sellers', async (req, res) => {
      await client.connect()
      const query = { role: 'seller' };
      const result = await usersCollection.find(query).toArray()
      res.send(result);
    });

    app.get('/doctors', async (req, res) => {
      await client.connect()
      const query = { role: 'doctor' };
      const result = await usersCollection.find(query).toArray()
      res.send(result);
    });

    app.put("/user/update/:role", async (req, res) => {
      const email = req.query.email;
      console.log(email)
      const role = req.params.role;
      console.log(role)
      const filter = { email: email }
      const users = await usersCollection.findOne(filter);
      const option = { upsert: true };
      if (role === 'request') {
        const updatedDoc = {
          $set: {
            role: role,
          },
        };
        const result = await usersCollection.updateOne(
          filter,
          updatedDoc,
          option
        );
        return res.send({ acknowledged: true });
      }
      else if (role === 'confirm') {
        const updatedDoc = {
          $set: {
            role: 'seller',
          },
        };
        const result = await usersCollection.updateOne(
          filter,
          updatedDoc,
          option
        );
        return res.send({ acknowledged: true });
      }
      else {
        const updatedDoc = {
          $set: {
            role: 'user',
          },
        };
        const result = await usersCollection.updateOne(
          filter,
          updatedDoc,
          option
        );
        return res.send({ acknowledged: true });
      }
    });

    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });

    app.get("/users/seller/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isSeller: user?.role === "seller" });
    });

    app.get("/users/doctor/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await usersCollection.findOne(query);
      res.send({ isDoctor: user?.role === "doctor" });
    });

// add temporary change in database
    app.get('/addIsRent', async (req, res) => {
      await client.connect()
      const filter = { role: 'doctor'};
      const option = { upsert: true };
      const updatedDoc = {
        $set: {
          doctorDetails: {}
        }
      }
      const result = await usersCollection.updateMany(filter, updatedDoc, option);
      res.send(result);
    });

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