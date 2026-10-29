require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'restaurantdb',
  waitForConnections: true,
  connectionLimit: 10
});

app.get('/api/health', async (req,res) => {
  try { await pool.query('SELECT 1'); res.json({ok:true,message:'Restaurant backend connected'}); }
  catch(e){ res.status(500).json({ok:false,error:e.message}); }
});

app.get('/api/menu', async (req,res) => {
  try { const [rows] = await pool.query('SELECT * FROM Menu ORDER BY MenuID'); res.json(rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/customers', async (req,res) => {
  try { const [rows] = await pool.query('SELECT * FROM Customers ORDER BY CustomerID DESC'); res.json(rows); }
  catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/orders', async (req,res) => {
  try {
    const [rows] = await pool.query(`
      SELECT o.OrderID,o.OrderDate,c.CustomerName,
      COALESCE(SUM(od.Quantity*m.Price),0) TotalAmount
      FROM Orders o JOIN Customers c ON o.CustomerID=c.CustomerID
      LEFT JOIN OrderDetails od ON o.OrderID=od.OrderID
      LEFT JOIN Menu m ON od.MenuID=m.MenuID
      GROUP BY o.OrderID,o.OrderDate,c.CustomerName ORDER BY o.OrderID DESC`);
    res.json(rows);
  } catch(e){ res.status(500).json({error:e.message}); }
});

app.get('/api/stats', async (req,res) => {
  try {
    const [[orders]] = await pool.query('SELECT COUNT(*) count FROM Orders');
    const [[customers]] = await pool.query('SELECT COUNT(*) count FROM Customers');
    const [[sales]] = await pool.query(`
      SELECT COALESCE(SUM(od.Quantity*m.Price),0) total
      FROM OrderDetails od
      JOIN Menu m ON od.MenuID=m.MenuID
    `);
    const [[items]] = await pool.query('SELECT COUNT(*) count FROM Menu');

    const [[couponData]] = await pool.query(`
      SELECT COUNT(*) count
      FROM Coupons
      WHERE IsActive = TRUE
      AND (ExpiryDate IS NULL OR ExpiryDate >= CURDATE())
    `);

    res.json({
      orders: orders.count,
      customers: customers.count,
      sales: sales.total,
      items: items.count,
      coupons: couponData.count
    });

  } catch(e) {
    res.status(500).json({error:e.message});
  }
});
app.post('/api/orders', async (req,res) => {
  const {customerId, customerName, phone, items, couponCode} = req.body;

  if(!customerName || !Array.isArray(items) || !items.length) {
    return res.status(400).json({error:'Customer and items are required'});
  }

  const conn = await pool.getConnection();

  try {
    await conn.beginTransaction();

    const [existing] = await conn.query(
      'SELECT CustomerID FROM Customers WHERE Phone=? LIMIT 1',
      [phone || '']
    );

    let customerIdFinal;

    if(existing.length) {
      customerIdFinal = existing[0].CustomerID;
    } else {
      const [r] = await conn.query(
        'INSERT INTO Customers(CustomerName,Phone) VALUES(?,?)',
        [customerName, phone || null]
      );
      customerIdFinal = r.insertId;
    }

    const [employee] = await conn.query(
      'SELECT EmployeeID FROM Employees ORDER BY EmployeeID LIMIT 1'
    );

    const employeeId = employee.length ? employee[0].EmployeeID : null;

    let subtotal = 0;

    for(const item of items) {
      const [m] = await conn.query(
        'SELECT Price, Stock FROM Menu WHERE MenuID=? FOR UPDATE',
        [item.menuId]
      );

      if(!m.length || m[0].Stock < item.quantity) {
        throw new Error(`Insufficient stock for item ${item.menuId}`);
      }

      subtotal += Number(m[0].Price) * Number(item.quantity);
    }

    let discount = 0;
    let couponId = null;

    if(couponCode) {
      const [coupons] = await conn.query(`
        SELECT *
        FROM Coupons
        WHERE Code=?
        AND IsActive=TRUE
        AND (ExpiryDate IS NULL OR ExpiryDate >= CURDATE())
        AND UsedCount < UsageLimit
        LIMIT 1
      `, [String(couponCode).toUpperCase()]);

      if(!coupons.length) {
        throw new Error('Invalid or expired coupon');
      }

      const coupon = coupons[0];

      if(subtotal < Number(coupon.MinOrderAmount)) {
        throw new Error(`Minimum order amount is ₹${coupon.MinOrderAmount}`);
      }

      if(coupon.DiscountType === 'PERCENT') {
        discount = subtotal * Number(coupon.DiscountValue) / 100;

        if(coupon.MaxDiscount !== null) {
          discount = Math.min(discount, Number(coupon.MaxDiscount));
        }
      } else {
        discount = Number(coupon.DiscountValue);
      }

      discount = Math.min(discount, subtotal);
      couponId = coupon.CouponID;

      await conn.query(
        'UPDATE Coupons SET UsedCount = UsedCount + 1 WHERE CouponID=?',
        [couponId]
      );
    }

    const [order] = await conn.query(
      'INSERT INTO Orders(CustomerID,EmployeeID) VALUES(?,?)',
      [customerIdFinal, employeeId]
    );

    for(const item of items) {
      await conn.query(
        'INSERT INTO OrderDetails(OrderID,MenuID,Quantity) VALUES(?,?,?)',
        [order.insertId,item.menuId,item.quantity]
      );
    }

    await conn.commit();

    res.json({
      success:true,
      orderId:order.insertId,
      subtotal:subtotal,
      discount:discount,
      total:subtotal-discount
    });

  } catch(e) {
    await conn.rollback();
    res.status(400).json({error:e.message});
  } finally {
    conn.release();
  }
});

app.post('/api/menu', async (req,res) => {
  try { const {itemName,category,price,stock=50}=req.body; const [r]=await pool.query('INSERT INTO Menu(ItemName,Category,Price,Stock) VALUES(?,?,?,?)',[itemName,category,price,stock]); res.json({success:true,id:r.insertId}); }
  catch(e){ res.status(400).json({error:e.message}); }
});

app.delete('/api/menu/:id', async (req,res) => {
  try { await pool.query('DELETE FROM Menu WHERE MenuID=?',[req.params.id]); res.json({success:true}); }
  catch(e){ res.status(400).json({error:e.message}); }
});
app.post('/api/admin/login', async (req,res) => {
  try {

    const { username, password } = req.body;

    if (
      username === 'admin' &&
      password === 'admin123'
    ) {

      return res.json({
        success: true,
        admin: {
          username: 'admin',
          name: 'Administrator'
        }
      });

    }

    return res.status(401).json({
      error: 'Invalid admin username or password'
    });

  } catch(e) {

    return res.status(400).json({
      error: e.message
    });

  }
});
app.get('/api/coupons', async (req,res) => {
  try {
    const [rows] = await pool.query(`
      SELECT *
      FROM Coupons
      WHERE IsActive = TRUE
      AND (ExpiryDate IS NULL OR ExpiryDate >= CURDATE())
      ORDER BY CouponID DESC
    `);
    res.json(rows);
  } catch(e) {
    res.status(500).json({error:e.message});
  }
});

app.post('/api/coupons', async (req,res) => {
  try {
    const {
      code,
      description,
      discountType,
      discountValue,
      minOrderAmount,
      maxDiscount,
      usageLimit,
      expiryDate
    } = req.body;

    if (!code || !discountValue) {
      return res.status(400).json({error:'Coupon code and discount value are required'});
    }

    const [result] = await pool.query(`
      INSERT INTO Coupons
      (Code, Description, DiscountType, DiscountValue, MinOrderAmount, MaxDiscount, UsageLimit, ExpiryDate)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      code.toUpperCase(),
      description || '',
      discountType || 'PERCENT',
      discountValue,
      minOrderAmount || 0,
      maxDiscount || null,
      usageLimit || 100,
      expiryDate || null
    ]);

    res.json({success:true,id:result.insertId});
  } catch(e) {
    res.status(400).json({error:e.message});
  }
});

app.post('/api/coupons/validate', async (req,res) => {
  try {
    const {code, subtotal} = req.body;

    const [rows] = await pool.query(`
      SELECT *
      FROM Coupons
      WHERE Code = ?
      AND IsActive = TRUE
      AND (ExpiryDate IS NULL OR ExpiryDate >= CURDATE())
      AND UsedCount < UsageLimit
      LIMIT 1
    `, [String(code || '').toUpperCase()]);

    if (!rows.length) {
      return res.status(400).json({error:'Invalid or expired coupon'});
    }

    const coupon = rows[0];

    if (Number(subtotal) < Number(coupon.MinOrderAmount)) {
      return res.status(400).json({
        error:`Minimum order amount is ₹${coupon.MinOrderAmount}`
      });
    }

    let discount = 0;

    if (coupon.DiscountType === 'PERCENT') {
      discount = Number(subtotal) * Number(coupon.DiscountValue) / 100;

      if (coupon.MaxDiscount !== null) {
        discount = Math.min(discount, Number(coupon.MaxDiscount));
      }
    } else {
      discount = Number(coupon.DiscountValue);
    }

    discount = Math.min(discount, Number(subtotal));

    res.json({
      success:true,
      coupon,
      discount
    });

  } catch(e) {
    res.status(500).json({error:e.message});
  }
});
app.post('/api/customer/register', async (req,res) => {
  try {
    const { name, email, phone, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({
        error:'Name, email and password are required'
      });
    }

    const [existing] = await pool.query(
      'SELECT CustomerID FROM Customers WHERE Email=? LIMIT 1',
      [email]
    );

    if (existing.length) {
      return res.status(400).json({
        error:'Email already registered'
      });
    }

    const crypto = require('crypto');
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    const [result] = await pool.query(
      'INSERT INTO Customers(CustomerName,Phone,Email,PasswordHash) VALUES(?,?,?,?)',
      [name, phone || null, email, passwordHash]
    );

    res.json({
      success:true,
      customer:{
        id:result.insertId,
        name:name,
        email:email,
        phone:phone || ''
      }
    });

  } catch(e) {
    res.status(400).json({error:e.message});
  }
});


app.post('/api/customer/login', async (req,res) => {
  try {
    const { email, password } = req.body;

    const crypto = require('crypto');
    const passwordHash = crypto
      .createHash('sha256')
      .update(password)
      .digest('hex');

    const [rows] = await pool.query(
      'SELECT CustomerID,CustomerName,Email,Phone FROM Customers WHERE Email=? AND PasswordHash=? LIMIT 1',
      [email,passwordHash]
    );

    if (!rows.length) {
      return res.status(401).json({
        error:'Invalid email or password'
      });
    }

    const c = rows[0];

    res.json({
      success:true,
      customer:{
        id:c.CustomerID,
        name:c.CustomerName,
        email:c.Email,
        phone:c.Phone || ''
      }
    });

  } catch(e) {
    res.status(400).json({error:e.message});
  }
});
app.get('/api/customer/orders/:customerId', async (req,res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        o.OrderID,
        o.OrderDate,
        m.ItemName,
        od.Quantity,
        m.Price,
        (od.Quantity * m.Price) AS Amount
      FROM Orders o
      JOIN OrderDetails od ON o.OrderID = od.OrderID
      JOIN Menu m ON od.MenuID = m.MenuID
      WHERE o.CustomerID = ?
      ORDER BY o.OrderID DESC
    `, [req.params.customerId]);

    res.json(rows);

  } catch(e) {
    res.status(500).json({error:e.message});
  }
});
app.get('*',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.listen(process.env.PORT || 3000,()=>console.log(`Restaurant Management running at http://localhost:${process.env.PORT||3000}`));
