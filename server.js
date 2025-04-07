require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const cors = require('cors');
const path = require('path');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Verify environment variables
if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.error('Missing required environment variables. Please check your .env file');
    process.exit(1);
}

// Create Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
    }
});

// Verify email configuration
transporter.verify((error, success) => {
    if (error) {
        console.error('Email configuration error:', error);
    } else {
        console.log('Email server is ready to send messages');
    }
});

// Store orders in memory for terminal display
let orders = [];

// Function to parse DD-MM-YYYY date format
function parseDate(dateStr) {
    if (!dateStr) return null;
    try {
        // Split the date string and convert to integers
        const [day, month, year] = dateStr.split('-').map(num => parseInt(num, 10));
        
        // Validate date parts
        if (isNaN(day) || isNaN(month) || isNaN(year)) {
            console.error('Invalid date parts:', { day, month, year, dateStr });
            return null;
        }

        // Create date with year, month (0-based), and day
        const date = new Date(year, month - 1, day);

        // Validate the resulting date
        if (isNaN(date.getTime())) {
            console.error('Invalid date created:', { date, dateStr });
            return null;
        }

        // Verify the date was parsed correctly by comparing original values
        if (date.getDate() !== day || (date.getMonth() + 1) !== month || date.getFullYear() !== year) {
            console.error('Date parts mismatch:', {
                original: { day, month, year },
                parsed: { 
                    day: date.getDate(), 
                    month: date.getMonth() + 1, 
                    year: date.getFullYear() 
                }
            });
            return null;
        }

        return date;
    } catch (error) {
        console.error('Error parsing date:', error, { dateStr });
        return null;
    }
}

// Function to format date to DD-MM-YYYY
function formatDate(date) {
    if (!date || isNaN(date.getTime())) return '';
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

// Function to check expiry dates and send notifications
async function checkExpiryDates(testDate = null) {
    // Use test date or current date
    const now = testDate ? parseDate(testDate) : new Date();
    console.log('\nChecking expiry dates...', formatDate(now));
    
    console.log('Current orders in memory:', orders.length);

    for (const order of orders) {
        console.log(`\nChecking order ${order.orderId} for ${order.email}`);
        for (const item of order.items) {
            // Parse the expiry date string directly
            const expiryDate = parseDate(item.expiryDate);
            if (!expiryDate) {
                console.error(`Invalid expiry date for item ${item.name}:`, item.expiryDate);
                continue;
            }
            
            console.log(`- ${item.name}: Expires on ${formatDate(expiryDate)}`);
            
            // Calculate days until expiry
            const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            console.log(`  Days until expiry: ${daysUntilExpiry}`);

            // Check if item expires in 2 days or 1 day
            if (daysUntilExpiry === 2 || daysUntilExpiry === 1) {
                try {
                    console.log(`  Sending expiry notification for ${item.name}`);
                    // Send expiry notification email
                    await transporter.sendMail({
                        from: process.env.GMAIL_USER,
                        to: order.email,
                        subject: `Expiry Alert - ${item.name} from Order #${order.orderId}`,
                        html: `
                            <h2>Product Expiry Alert</h2>
                            <p>Dear Customer,</p>
                            <p>This is a reminder that the following item from your order will expire in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}:</p>
                            <div style="background-color: #f8f8f8; padding: 15px; border-radius: 5px; margin: 15px 0;">
                                <p><strong>Item:</strong> ${item.name}</p>
                                <p><strong>Quantity:</strong> ${item.quantity}</p>
                                <p><strong>Expiry Date:</strong> ${formatDate(expiryDate)}</p>
                                <p><strong>Order ID:</strong> ${order.orderId}</p>
                                <p><strong>Purchase Date:</strong> ${order.date}</p>
                            </div>
                            <p>Please consume this item before it expires.</p>
                            <br>
                            <p>Best regards,<br>Grocery Expiration Alert Team</p>
                        `
                    });
                    console.log(`  ✓ Expiry notification sent for ${item.name} to ${order.email}`);
                } catch (error) {
                    console.error(`  ✗ Error sending expiry notification for ${item.name}:`, error);
                }
            }
        }
    }
    console.log('\nExpiry check completed');
}

// Run expiry check every 1 minute
setInterval(() => checkExpiryDates(), 1 * 60 * 1000);

// Display orders in terminal endpoint
app.post('/api/display-order', async (req, res) => {
    const orderDetails = req.body;
    orders.push(orderDetails);
    
    // Clear terminal and display all orders
    console.clear();
    console.log('\n=== GROCERY EXPIRATION ALERT - ORDER SYSTEM ===');
    console.log('Total Orders:', orders.length);
    console.log('==========================================');
    
    // Display latest order
    console.log('\nLATEST ORDER:');
    console.log('------------------------------------------');
    console.log('Order ID:', orderDetails.orderId);
    console.log('Customer:', orderDetails.email);
    console.log('Items:');
    orderDetails.items.forEach(item => {
        const expiryDate = new Date(item.expiryDate);
        console.log(`  - ${item.name} x ${item.quantity} = ₹${item.price * item.quantity} (Expires: ${formatDate(expiryDate)})`);
    });
    console.log('Total Amount:', `₹${orderDetails.total}`);
    console.log('Date:', orderDetails.date);
    console.log('Status:', orderDetails.status.toUpperCase());
    
    // Display all order IDs
    console.log('\nALL ORDER IDs:');
    console.log('------------------------------------------');
    orders.forEach((order, index) => {
        console.log(`${index + 1}. ${order.orderId} - ${order.email} - ₹${order.total}`);
    });
    console.log('==========================================\n');

    // Send confirmation email
    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: orderDetails.email,
            subject: `Order Confirmation - ${orderDetails.orderId}`,
            html: `
                <h2>Order Confirmation</h2>
                <p>Thank you for your order!</p>
                <p><strong>Order ID:</strong> ${orderDetails.orderId}</p>
                <h3>Order Details:</h3>
                <ul>
                    ${orderDetails.items.map(item => {
                        // Parse the expiry date string directly using our parseDate function
                        const expiryDate = parseDate(item.expiryDate);
                        const formattedExpiryDate = expiryDate ? formatDate(expiryDate) : item.expiryDate;
                        return `
                            <li>${item.name} x ${item.quantity} - ₹${item.price * item.quantity}
                                <br>Expires on: ${formattedExpiryDate}</li>
                        `;
                    }).join('')}
                </ul>
                <p><strong>Total Amount:</strong> ₹${orderDetails.total}</p>
                <p><strong>Order Date:</strong> ${orderDetails.date}</p>
                <p>You will receive notifications 2 days and 1 day before any item is about to expire.</p>
                <br>
                <p>Best regards,<br>Grocery Expiration Alert Team</p>
            `
        });
        console.log('Confirmation email sent to:', orderDetails.email);
    } catch (error) {
        console.error('Error sending confirmation email:', error);
    }

    res.status(200).json({ message: 'Order displayed in terminal and email sent' });
});

// Manual trigger for expiry check (for testing)
app.post('/api/check-expiry', async (req, res) => {
    const testDate = req.body.testDate;
    await checkExpiryDates(testDate);
    res.status(200).json({ message: 'Expiry check completed' });
});

// Test endpoint for specific dates
app.get('/api/test-expiry/:date', async (req, res) => {
    const testDate = req.params.date; // Format: DD-MM-YYYY
    console.log('Testing expiry check for date:', testDate);
    await checkExpiryDates(testDate);
    res.status(200).json({ message: 'Expiry check completed for test date: ' + testDate });
});

// Create new order
app.post('/api/orders', async (req, res) => {
    try {
        console.log('Received order:', req.body);
        const orderData = req.body;
        const order = new Order(orderData);
        const savedOrder = await order.save();
        console.log('Order saved successfully:', savedOrder);
        res.status(201).json(savedOrder);
    } catch (error) {
        console.error('Error creating order:', error);
        res.status(500).json({ 
            error: 'Failed to create order',
            details: error.message 
        });
    }
});

// Get all orders endpoint
app.get('/api/orders', (req, res) => {
    res.json(orders);
});

// Get order by ID
app.get('/api/orders/:orderId', async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        res.status(200).json(order);
    } catch (error) {
        console.error('Error fetching order:', error);
        res.status(500).json({ error: 'Failed to fetch order' });
    }
});

// Email sending endpoint
app.post('/api/send-email', async (req, res) => {
    try {
        console.log('Sending email to:', req.body.to);
        const { to, subject, html } = req.body;

        const mailOptions = {
            from: process.env.GMAIL_USER,
            to,
            subject,
            html
        };

        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully to:', to);
        res.status(200).json({ message: 'Email sent successfully' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ 
            error: 'Failed to send email',
            details: error.message 
        });
    }
});

// View orders endpoint
app.get('/api/view-orders', (req, res) => {
    console.log('\n=== Stored Orders ===');
    console.log('Orders can be found in browser localStorage under:');
    console.log('1. "orders" - All order details');
    console.log('2. "orders_[email]" - User-specific order IDs');
    console.log('\nTo view orders in browser console, use:');
    console.log('localStorage.getItem("orders")');
    res.status(200).json({ message: 'Check server console for order information' });
});

// Serve static files
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/products', (req, res) => {
    res.sendFile(path.join(__dirname, 'products.html'));
});

app.get('/cart', (req, res) => {
    res.sendFile(path.join(__dirname, 'cart.html'));
});

app.get('/payment', (req, res) => {
    res.sendFile(path.join(__dirname, 'payment.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        emailConfig: {
            configured: !!process.env.GMAIL_USER && !!process.env.GMAIL_APP_PASSWORD,
            email: process.env.GMAIL_USER
        }
    });
});

// Test connection endpoint
app.get('/test-connection', (req, res) => {
    res.json({ 
        success: true,
        message: 'Server is running and accepting connections',
        timestamp: new Date().toISOString()
    });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.clear();
    console.log(`Server running on port ${PORT}`);
    console.log('\n=== GROCERY EXPIRATION ALERT - ORDER SYSTEM ===');
    console.log('Email configured for:', process.env.GMAIL_USER);
    console.log('Expiry check running every 1 minute');
    console.log('Waiting for orders...');
    console.log('==========================================\n');

    // Run initial expiry check
    checkExpiryDates();
}); 