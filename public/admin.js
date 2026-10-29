async function api(u,o){
  const r=await fetch(u,o);
  const d=await r.json();

  if(!r.ok){
    throw Error(d.error);
  }

  return d;
}


function toast(x){

  const t=document.getElementById('toast');

  if(!t){
    return;
  }

  t.textContent=x;
  t.style.display='block';

  setTimeout(()=>{
    t.style.display='none';
  },2500);

}


async function loadAdmin(){

  try{

    const s=await api('/api/stats');

    document.getElementById('sales').textContent=
      '₹'+Number(s.sales).toLocaleString('en-IN');

    document.getElementById('orders').textContent=
      s.orders;

    document.getElementById('customers').textContent=
      s.customers;

    document.getElementById('coupons').textContent=
      s.coupons || 0;


    const [os,cs,ms]=await Promise.all([
      api('/api/orders'),
      api('/api/customers'),
      api('/api/menu')
    ]);


    /* =========================
       RECENT ORDERS
    ========================= */

    document.getElementById('orderTable').innerHTML=

      '<table class="table">'+

      '<tr>'+
      '<th>#</th>'+
      '<th>Customer</th>'+
      '<th>Coupon</th>'+
      '<th>Total</th>'+
      '<th>Status</th>'+
      '</tr>'+

      os.slice(0,12).map(x=>`

        <tr>

          <td>#${x.OrderID}</td>

          <td>${x.CustomerName}</td>

          <td>
            ${x.Coupon || 'No Coupon'}
          </td>

          <td>
            ₹${Number(x.TotalAmount || 0).toFixed(0)}
          </td>

          <td>
            <span class="status">
              ${x.Status || 'Completed'}
            </span>
          </td>

        </tr>

      `).join('')+

      '</table>';


    /* =========================
       CUSTOMERS
    ========================= */

    document.getElementById('customerTable').innerHTML=

      '<table class="table">'+

      '<tr>'+
      '<th>Name</th>'+
      '<th>Email</th>'+
      '<th>Phone</th>'+
      '</tr>'+

      cs.slice(0,10).map(x=>`

        <tr>

          <td>${x.CustomerName}</td>

          <td>${x.Email || '-'}</td>

          <td>${x.Phone || '-'}</td>

        </tr>

      `).join('')+

      '</table>';


    /* =========================
       MENU INVENTORY
    ========================= */

    document.getElementById('menuTable').innerHTML=

      '<table class="table">'+

      '<tr>'+
      '<th>Item</th>'+
      '<th>Category</th>'+
      '<th>Price</th>'+
      '<th>Stock</th>'+
      '<th>Available</th>'+
      '</tr>'+

      ms.map(x=>`

        <tr>

          <td>
            ${x.ImageEmoji || '🍽️'} ${x.ItemName}
          </td>

          <td>
            ${x.Category}
          </td>

          <td>
            ₹${Number(x.Price).toFixed(2)}
          </td>

          <td>
            ${x.Stock}
          </td>

          <td>
            ${Number(x.Stock) > 0 ? 'Yes' : 'No'}
          </td>

        </tr>

      `).join('')+

      '</table>';

  }

  catch(e){

    toast(e.message);

  }

}


async function addItem(){

  try{

    await api('/api/menu',{
      method:'POST',

      headers:{
        'Content-Type':'application/json'
      },

      body:JSON.stringify({

        itemName:newName.value,

        category:newCat.value,

        price:Number(newPrice.value),

        stock:Number(newStock.value),

        emoji:newEmoji.value || '🍽️'

      })

    });

    toast('Menu item added');

    loadAdmin();

  }

  catch(e){

    toast(e.message);

  }

}


async function addCoupon(){

  try{

    await api('/api/coupons',{

      method:'POST',

      headers:{
        'Content-Type':'application/json'
      },

      body:JSON.stringify({

        code:cCode.value,

        description:cDesc.value,

        discountType:cType.value,

        discountValue:Number(cValue.value),

        minOrderAmount:Number(cMin.value || 0),

        maxDiscount:
          cMax.value
          ? Number(cMax.value)
          : null,

        usageLimit:
          Number(cLimit.value || 100),

        expiryDate:cExpiry.value

      })

    });

    toast('Coupon created 🎟️');

    loadAdmin();

  }

  catch(e){

    toast(e.message);

  }

}


loadAdmin();