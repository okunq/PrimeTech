
let currentCategoryId = null; // поточна обрана категорія для фільтрації

document.addEventListener('DOMContentLoaded', () => {
    // стартова ініціалізація при завантаженні сторінки
    fetchProducts(); 
    updateCartUI(); 
    checkAuth(); 
    setupCategoryFilters(); 
    setupSearch(); 
});


function setupSearch() {
    const searchInput = document.querySelector('.search_input');
    const applyPriceBtn = document.getElementById('apply_price_btn');
    const resetPriceBtn = document.getElementById('reset_price_btn'); 

    // підключаємо елементи пошуку та фільтрів
    if (searchInput) {
        searchInput.addEventListener('input', () => {
            fetchProducts(currentCategoryId);
        });
    }

    
    if (applyPriceBtn) {
        applyPriceBtn.addEventListener('click', () => {
            fetchProducts(currentCategoryId);
        });
    }

    
    if (resetPriceBtn) {
        resetPriceBtn.addEventListener('click', () => {
            
            document.getElementById('price_min').value = '';
            document.getElementById('price_max').value = '';
            if (searchInput) searchInput.value = '';
            
            
            fetchProducts(currentCategoryId);
        });
    }
}


function setupCategoryFilters() {
    const links = document.querySelectorAll('#sidebar_categories a');
    
    // налаштовуємо фільтрацію по категоріях
    links.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault(); 
            
            currentCategoryId = e.target.getAttribute('data-category');
            
            
            const searchInput = document.querySelector('.search_input');
            if(searchInput) searchInput.value = '';

            fetchProducts(currentCategoryId);
        });
    });
}



let currentPage = 1;

async function fetchProducts(categoryId = null, page = 1) {
    currentPage = page;
    try {
        const productsGrid = document.getElementById('products_grid');
        if (!productsGrid) return; 

        
        // формуємо URL запиту до API з параметрами фільтрів
        let url = new URL('/api/products', window.location.origin);
        
        
        if (categoryId) url.searchParams.append('category', categoryId);
        
        const searchInput = document.querySelector('.search_input');
        const priceMin = document.getElementById('price_min');
        const priceMax = document.getElementById('price_max');

        if (searchInput && searchInput.value) url.searchParams.append('search', searchInput.value);
        if (priceMin && priceMin.value) url.searchParams.append('minPrice', priceMin.value);
        if (priceMax && priceMax.value) url.searchParams.append('maxPrice', priceMax.value);

        
        url.searchParams.append('page', page);

        
        const response = await fetch(url);
        const products = await response.json();
        
        
        productsGrid.innerHTML = '';
        
        
        if (products.length === 0) {
            productsGrid.innerHTML = '<h2 style="color: white; grid-column: 1/-1; text-align: center; margin-top: 50px;">Товарів не знайдено</h2>';
        } else {
            products.forEach(product => {
                let statusClass = product.status === 'В наявності' ? 'color: #4CAF50;' : 'color: #F44336;';
                
                const safeName = product.name.replace(/'/g, "\\'").replace(/"/g, "&quot;");
                
                const card = `
                    <div class="product_card">
                        <div class="product_img">
                            <a href="product.html?id=${product.id}"><img src="${product.image_url}" alt="${product.name}"></a>
                        </div>
                        <div class="product_info">
                            <a href="product.html?id=${product.id}" class="product_title_link">
                                <h3 class="product_title">${product.name}</h3>
                            </a>
                            <span style="font-size: 14px; font-weight: bold; margin-bottom: 10px; ${statusClass}">${product.status || 'В наявності'}</span>
                            <span class="product_price">${product.price} ₴</span>
                            <button class="buy_btn" style="margin-top: 15px;" onclick="addToCart(${product.id}, '${safeName}', ${product.price}, '${product.image_url}')">В кошик</button>
                        </div>
                    </div>
                `;
                productsGrid.innerHTML += card;
            });
        }

        
        if (products.length > 0) {
            const totalCount = products[0].total_count;
            const totalPages = Math.ceil(totalCount / 12); 

            const pagination = document.createElement('div');
            pagination.style.cssText = "display: flex; justify-content: center; gap: 10px; margin-top: 40px; padding-bottom: 50px; grid-column: 1 / -1;";
            
            for (let i = 1; i <= totalPages; i++) {
                const btn = document.createElement('button');
                btn.textContent = i;
                btn.className = (i === currentPage) ? 'auth_submit_btn' : 'page_btn';
                
                if (i !== currentPage) {
                    btn.style.cssText = "background: rgba(255,255,255,0.05); border: none; color: white; padding: 8px 15px; border-radius: 8px; cursor: pointer;";
                } else {
                    btn.style.width = "auto"; 
                    btn.style.padding = "8px 15px"; 
                    btn.style.marginTop = "0";
                }
                
                btn.onclick = () => {
                    window.scrollTo({ top: 0, behavior: 'smooth' }); 
                    fetchProducts(categoryId, i);
                };
                pagination.appendChild(btn);
            }
            productsGrid.appendChild(pagination);
        }
    } catch (error) { 
        console.error("Помилка завантаження товарів:", error); 
    }
}


function addToCart(id, name, price, image) {
    // додаємо товар до кошика або збільшуємо кількість, якщо він вже є
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    let existingItem = cart.find(item => item.id === id);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ id, name, price, image, quantity: 1 });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
    
    
    showToast('✅ Товар додано в кошик', 'success');
}


function changeQuantity(index, delta) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    if (cart[index]) {
        cart[index].quantity += delta;
        
        if (cart[index].quantity <= 0) {
            cart.splice(index, 1);
        }
        localStorage.setItem('cart', JSON.stringify(cart));
        updateCartUI();
    }
}


function removeFromCart(index) {
    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cart.splice(index, 1);
    localStorage.setItem('cart', JSON.stringify(cart));
    updateCartUI();
}

function updateCartUI() {
    const cartItemsContainer = document.querySelector('.cart_items');
    const cartTotalSpan = document.querySelector('.cart_total span:last-child');
    if (!cartItemsContainer) return;

    let cart = JSON.parse(localStorage.getItem('cart')) || [];
    cartItemsContainer.innerHTML = ''; 
    let totalSum = 0;

    cart.forEach((item, index) => {
        
        let qty = item.quantity || 1; 
        let itemTotal = parseFloat(item.price) * qty;
        totalSum += itemTotal;

        cartItemsContainer.innerHTML += `
            <div class="cart_item" style="position: relative;">
                <img src="${item.image}" alt="Product">
                <div class="cart_item_info" style="flex: 1;">
                    <h4 style="padding-right: 70px; line-height: 1.4;">${item.name}</h4>
                    <span class="cart_item_price">${item.price} ₴</span>
                    
                    <div style="display: flex; gap: 10px; align-items: center; margin-top: 10px;">
                        <button onclick="changeQuantity(${index}, -1)" style="width: 25px; height: 25px; border-radius: 5px; border: none; background: rgba(255,255,255,0.1); color: white; cursor: pointer; font-size: 16px;">-</button>
                        <span style="font-weight: bold; width: 20px; text-align: center;">${qty}</span>
                        <button onclick="changeQuantity(${index}, 1)" style="width: 25px; height: 25px; border-radius: 5px; border: none; background: rgba(255,255,255,0.1); color: white; cursor: pointer; font-size: 16px;">+</button>
                    </div>
                </div>
                <button class="remove_item_btn" onclick="removeFromCart(${index})" style="position: absolute; top: 15px; right: 15px;">Видалити</button>
            </div>
        `;
    });
    
    if (cartTotalSpan) cartTotalSpan.textContent = totalSum.toFixed(2) + ' ₴';
}

// Функція для завантаження категорій
async function loadCategories() {
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        
        const selectElement = document.getElementById('category_id');
        
        // Очищаємо список перед додаванням
        selectElement.innerHTML = '<option value="" disabled selected>Оберіть категорію</option>';
        
        // Перебираємо кожну категорію з БД і створюємо <option>
        categories.forEach(category => {
            const option = document.createElement('option');
            option.value = category.id; // Це той самий ID з бази (1, 2, 3...)
            option.textContent = category.name; // Це назва (Ноутбуки, Смартфони...)
            selectElement.appendChild(option);
        });
        
    } catch (error) {
        console.error('Помилка завантаження категорій:', error);
        document.getElementById('category_id').innerHTML = '<option value="" disabled>Помилка завантаження</option>';
    }
}

// Запускаємо функцію, коли сторінка адмінки завантажилась
document.addEventListener('DOMContentLoaded', () => {
    loadCategories();
});

function checkAuth() {
    const user = JSON.parse(localStorage.getItem('user'));
    const accountLink = document.querySelector('.account_link a');

    if (user && accountLink) {
        
        const ADMIN_EMAIL = 'kaptuhandrej@gmail.com'; 
        
        
        const avatarUrl = `https://ui-avatars.com/api/?name=${user.name}&background=random&color=fff&rounded=true&size=40`;

        
        let adminBtn = '';
        if (user.email === ADMIN_EMAIL) {
            
            adminBtn = `
                <a href="admin.html" style="
                    color: #FFD700; 
                    font-weight: bold; 
                    margin-right: 10px; 
                    border: 1.5px solid #FFD700; 
                    padding: 5px 12px; 
                    border-radius: 20px; 
                    font-size: 14px;
                    transition: all 0.3s;
                " onmouseover="this.style.background='#FFD700'; this.style.color='#000'" 
                   onmouseout="this.style.background='transparent'; this.style.color='#FFD700'">
                    Адмін
                </a>`;
        }

        
        accountLink.parentElement.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.1); padding: 5px 15px; border-radius: 30px;">
                ${adminBtn}
                <img src="${avatarUrl}" alt="Avatar" style="width: 35px; height: 35px; border-radius: 50%; box-shadow: 0 2px 5px rgba(0,0,0,0.3);">
                <span style="color: white; font-weight: bold; font-size: 16px;">${user.name}</span>
                <a href="#" id="logout_btn" style="font-size: 14px; color: #ff4d4d; text-decoration: underline; margin-left: 10px;">Вийти</a>
            </div>
        `;

        
        document.getElementById('logout_btn').addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('user'); 
            window.location.href = 'index.html'; 
        });
    }
}


function showToast(message, type = 'success') {
    // створюємо або знаходимо контейнер для сповіщень
    let container = document.getElementById('toast_container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast_container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = message;

    container.appendChild(toast);

    
    setTimeout(() => toast.classList.add('show'), 10);

    
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); 
    }, 3000);
}