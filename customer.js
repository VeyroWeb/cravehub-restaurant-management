const box = document.getElementById('customerAuth');

function login(){
  box.innerHTML = `
    <form onsubmit="doLogin(event)">
      <input id="loginEmail" type="email" placeholder="Email" required>
      <input id="loginPassword" type="password" placeholder="Password" required>
      <button class="primary full">Login →</button>
    </form>
    <p class="switch">New here? <button onclick="register()">Create account</button></p>
  `;
}

function register(){
  box.innerHTML = `
    <form onsubmit="doRegister(event)">
      <input id="registerName" placeholder="Full name" required>
      <input id="registerEmail" type="email" placeholder="Email" required>
      <input id="registerPhone" placeholder="Phone">
      <input id="registerPassword" type="password" placeholder="Password" required>
      <button class="primary full">Create Account →</button>
    </form>
    <p class="switch">Already registered? <button onclick="login()">Login</button></p>
  `;
}

async function doLogin(e){
  e.preventDefault();

  try{
    const r = await fetch('/api/customer/login',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        email:document.getElementById('loginEmail').value,
        password:document.getElementById('loginPassword').value
      })
    });

    const d = await r.json();

    if(!r.ok) throw Error(d.error);

    localStorage.setItem('customer',JSON.stringify(d.customer));
    location.href='/';

  }catch(e){
    alert(e.message);
  }
}

async function doRegister(e){
  e.preventDefault();

  try{
    const r = await fetch('/api/customer/register',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        name:document.getElementById('registerName').value,
        email:document.getElementById('registerEmail').value,
        phone:document.getElementById('registerPhone').value,
        password:document.getElementById('registerPassword').value
      })
    });

    const d = await r.json();

    if(!r.ok) throw Error(d.error);

    localStorage.setItem('customer',JSON.stringify(d.customer));
    location.href='/';

  }catch(e){
    alert(e.message);
  }
}

login();