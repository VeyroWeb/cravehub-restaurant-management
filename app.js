let menu=[],cart=[],activeCategory='All',appliedCoupon=null;

const emojis={
  Burgers:'🍔',
  Pizza:'🍕',
  Pasta:'🍝',
  Sides:'🍟',
  Beverages:'🥤',
  Desserts:'🍨'
};

async function api(u,o){
  const r=await fetch(u,o);
  const d=await r.json();

  if(!r.ok){
    throw Error(d.error||'Something went wrong');
  }

  return d;
}


async function loadAll(){

  try{

    menu=await api('/api/menu');

    renderMenu();

    loadCoupons();

    const c=JSON.parse(localStorage.getItem('customer')||'null');

    if(c){

      const ghost=document.querySelector('.ghost');

      if(ghost){
        ghost.textContent='👋 '+c.name;
        ghost.onclick=()=>toast('Logged in as '+c.name);
      }

    }

  }catch(e){

    toast(e.message);

  }

}


function renderMenu(){

  const q=(document.getElementById('search')?.value||'').toLowerCase();

  const list=menu.filter(x=>
    (activeCategory==='All'||x.Category===activeCategory) &&
    x.ItemName.toLowerCase().includes(q)
  );

  document.getElementById('menuGrid').innerHTML=

    list.map(x=>`

      <article class="menuCard">

        <div class="foodPic">
          ${x.ImageEmoji||emojis[x.Category]||'🍽️'}
        </div>

        <div class="tag">${x.Category}</div>

        <h3>${x.ItemName}</h3>

        <small>
          ${x.Stock>0?x.Stock+' available':'Out of stock'}
        </small>

        <div class="priceRow">

          <span class="price">
            ₹${Number(x.Price).toFixed(0)}
          </span>

          <button
            class="add"
            ${x.Stock<1?'disabled':''}
            onclick="addCart(${x.MenuID})"
          >
            +
          </button>

        </div>

      </article>

    `).join('')

    ||'<p>No matching items.</p>';
}


function filterMenu(cat,btn){

  activeCategory=cat;

  document
    .querySelectorAll('.categories button')
    .forEach(b=>b.classList.remove('active'));

  btn.classList.add('active');

  renderMenu();
}


function addCart(id){

  const x=menu.find(m=>m.MenuID===id);

  const c=cart.find(i=>i.MenuID===id);

  if(c){

    if(c.quantity>=x.Stock){
      return toast('Not enough stock available');
    }

    c.quantity++;

  }else{

    cart.push({...x,quantity:1});

  }

  updateCart();

  toast(x.ItemName+' added 🛒');
}


function subtotal(){

  return cart.reduce(
    (a,b)=>a+b.Price*b.quantity,
    0
  );

}


function updateCart(){

  const count=cart.reduce(
    (a,b)=>a+b.quantity,
    0
  );

  document.getElementById('cartCount').textContent=count;


  document.getElementById('cartItems').innerHTML=

    cart.length

    ?

    cart.map(i=>`

      <div class="cartLine">

        <div>
          <b>${i.ItemName}</b>
          <br>
          <small>₹${i.Price} × ${i.quantity}</small>
        </div>

        <div>
          <b>₹${i.Price*i.quantity}</b>
          <br>
          <button onclick="removeCart(${i.MenuID})">
            Remove
          </button>
        </div>

      </div>

    `).join('')

    :

    '<p>Your cart is empty.</p>';


  const d=appliedCoupon?.discount||0;

  document.getElementById('cartTotal').textContent=
    '₹'+Math.max(0,subtotal()-d).toFixed(0);

}


function removeCart(id){

  cart=cart.filter(i=>i.MenuID!==id);

  appliedCoupon=null;

  updateCart();

}


function openCart(){

  const c=JSON.parse(
    localStorage.getItem('customer')||'null'
  );

  if(c){

    const nameBox=document.getElementById('customerName');
    const phoneBox=document.getElementById('phone');

    if(nameBox){
      nameBox.value=c.name;
    }

    if(phoneBox){
      phoneBox.value=c.phone||'';
    }

  }

  updateCart();

  document
    .getElementById('cartModal')
    .classList.add('show');

}


function closeCart(){

  document
    .getElementById('cartModal')
    .classList.remove('show');

}


async function applyCoupon(){

  const couponBox=document.getElementById('couponCode');

  if(!couponBox){
    return;
  }

  if(!couponBox.value.trim()){
    return toast('Enter a coupon code');
  }

  try{

    const d=await api(
      '/api/coupons/validate',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify({
          code:couponBox.value,
          subtotal:subtotal()
        })
      }
    );

    appliedCoupon=d.coupon;

    appliedCoupon.discount=d.discount;

    const msg=document.getElementById('couponMsg');

    if(msg){
      msg.innerHTML=
        `<span class="success">
          ✓ ${d.coupon.Code} applied — saved ₹${d.discount.toFixed(0)}
        </span>`;
    }

    updateCart();

  }catch(e){

    appliedCoupon=null;

    const msg=document.getElementById('couponMsg');

    if(msg){
      msg.innerHTML=
        `<span class="error">${e.message}</span>`;
    }

    updateCart();

  }

}


async function placeOrder(){

  const c=JSON.parse(
    localStorage.getItem('customer')||'null'
  );

  const name=
    document.getElementById('customerName').value.trim();

  const ph=
    document.getElementById('phone').value.trim();


  if(!name||!cart.length){

    return toast(
      'Enter your name and add food first'
    );

  }


  try{

    const r=await api(
      '/api/orders',
      {
        method:'POST',
        headers:{
          'Content-Type':'application/json'
        },
        body:JSON.stringify({

          customerId:c?.id,

          customerName:name,

          phone:ph,

          items:cart.map(i=>({
            menuId:i.MenuID,
            quantity:i.quantity
          })),

          couponCode:appliedCoupon?.Code

        })
      }
    );


    const total=
      Math.max(
        0,
        subtotal()-(appliedCoupon?.discount||0)
      ).toFixed(0);


    toast(
      `Order #${r.orderId} placed 🎉 Total ₹${total}`
    );


    cart=[];

    appliedCoupon=null;

    closeCart();

    loadAll();


  }catch(e){

    toast(e.message);

  }

}


async function loadCoupons(){

  try{

    const grid=document.getElementById('couponGrid');

    if(!grid){
      return;
    }

    const cs=await api('/api/coupons');

    grid.innerHTML=

      cs.map(c=>`

        <div class="coupon">

          <div class="couponIcon">🎟️</div>

          <div>

            <b>${c.Code}</b>

            <p>${c.Description||''}</p>

            <small>
              ${
                c.DiscountType==='PERCENT'
                ? c.DiscountValue+'% OFF'
                : '₹'+c.DiscountValue+' OFF'
              }

              • Min ₹${c.MinOrderAmount}

            </small>

          </div>

          <button onclick="copyCoupon('${c.Code}')">
            COPY
          </button>

        </div>

      `).join('');


  }catch(e){

    // Coupon section is optional on customer homepage.

  }

}


function copyCoupon(code){

  navigator.clipboard?.writeText(code);

  const couponBox=document.getElementById('couponCode');

  if(couponBox){
    couponBox.value=code;
  }

  toast(code+' copied — use it in cart');

}


function openLogin(type){

  if(type==='customer'){
    location.href='/customer.html';
  }else{
    location.href='/admin-login.html';
  }

}


function closeLogin(){

  const modal=document.getElementById('loginModal');

  if(modal){
    modal.classList.remove('show');
  }

}


function toast(msg){

  const t=document.getElementById('toast');

  if(!t){
    return;
  }

  t.textContent=msg;

  t.style.display='block';

  clearTimeout(window.tt);

  window.tt=setTimeout(
    ()=>t.style.display='none',
    2500
  );

}


function scrollToId(id){

  const element=document.getElementById(id);

  if(element){
    element.scrollIntoView({
      behavior:'smooth'
    });
  }

}


loadAll();
  async function showMyOrders(){
  const customer = JSON.parse(localStorage.getItem('customer') || 'null');

  if(!customer){
    toast('Please login first');
    return;
  }

  const box = document.getElementById('myOrders');

  try {
    const orders = await api(`/api/customer/orders/${customer.id}`);

    if(!orders.length){
      box.innerHTML = '<p>You have not placed any orders yet.</p>';
      return;
    }

    const grouped = {};

    orders.forEach(o => {
      if(!grouped[o.OrderID]){
        grouped[o.OrderID] = {
          orderId: o.OrderID,
          date: o.OrderDate,
          items: [],
          total: 0
        };
      }

      grouped[o.OrderID].items.push(o);
      grouped[o.OrderID].total += Number(o.Amount);
    });

    box.innerHTML = Object.values(grouped).map(order => `
      <div class="orderCard">
        <div class="orderHeader">
          <div>
            <b>Order #${order.orderId}</b>
            <small>${new Date(order.date).toLocaleDateString('en-IN')}</small>
          </div>
          <strong>₹${order.total.toFixed(0)}</strong>
        </div>

        <div class="orderItems">
          ${order.items.map(item => `
            <div class="orderItem">
              <span>🍽️ ${item.ItemName}</span>
              <span>× ${item.Quantity} — ₹${Number(item.Amount).toFixed(0)}</span>
            </div>
          `).join('')}
        </div>

        <div class="orderTotal">
          <span>Order Total</span>
          <b>₹${order.total.toFixed(0)}</b>
        </div>
      </div>
    `).join('');

    document.getElementById('orders').scrollIntoView({
      behavior:'smooth'
    });

  } catch(e) {
    box.innerHTML = `<p>${e.message}</p>`;
  }
}