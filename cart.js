class CartManager {
    constructor() {
        this.setupEventListeners();
        this.displayCart();
        this.quantityUpdateTimeout = null;
    }

    get cart() {
        return JSON.parse(localStorage.getItem('cart')) || [];
    }

    set cart(value) {
        localStorage.setItem('cart', JSON.stringify(value));
    }

    setupEventListeners() {
        const checkoutBtn = document.getElementById('checkout-btn');
        if (checkoutBtn) {
            checkoutBtn.addEventListener('click', () => this.handleCheckout());
        }
    }

    displayCart() {
        const cartItems = document.getElementById('cart-items');
        const cartTotal = document.getElementById('cart-total');
        if (!cartItems || !cartTotal) return;

        const currentCart = this.cart;
        if (currentCart.length === 0) {
            cartItems.innerHTML = '<p>Your cart is empty</p>';
            cartTotal.textContent = '₹0.00';
            return;
        }

        cartItems.innerHTML = currentCart.map(item => {
            // Format expiry date to DD-MM-YYYY
            const expiryDate = new Date(item.expiryDate);
            const day = String(expiryDate.getDate()).padStart(2, '0');
            const month = String(expiryDate.getMonth() + 1).padStart(2, '0');
            const year = expiryDate.getFullYear();
            const formattedExpiryDate = `${day}-${month}-${year}`;
            
            return `
                <div class="cart-item">
                    <div class="item-details">
                        <h3 style="color: black">${item.name}</h3>
                        <p class="item-price" style="color: black">₹${item.price.toFixed(1)} x ${item.quantity}</p>
                        <p class="item-subtotal" style="color: black">Subtotal: ₹${(item.price * item.quantity).toFixed(1)}</p>
                        
                    </div>
                    <div class="item-actions">
                        <div class="quantity-controls">
                            <button class="quantity-btn minus-btn" data-id="${item.id}" data-action="decrease" 
                                ${item.quantity <= 1 ? 'disabled' : ''}>
                                <span class="btn-icon" style="color: black">-</span>
                            </button>
                            <div class="quantity-wrapper">
                                <input type="number" class="quantity-input" value="${item.quantity}" 
                                    min="1" max="10" data-id="${item.id}" 
                                    ${item.quantity >= 10 ? 'disabled' : ''}
                                    style="color: black">
                            </div>
                            <button class="quantity-btn plus-btn" data-id="${item.id}" data-action="increase" 
                                ${item.quantity >= 10 ? 'disabled' : ''}>
                                <span class="btn-icon" style="color: black">+</span>
                            </button>
                        </div>
                        <button class="remove-btn" data-id="${item.id}">
                            <span class="remove-icon" style="color: black">×</span> Remove
                        </button>
                    </div>
                </div>
            `;
        }).join('');

        const total = currentCart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        cartTotal.textContent = `₹${total.toFixed(1)}`;

        this.setupCartItemListeners();
    }

    setupCartItemListeners() {
        const cartItems = document.getElementById('cart-items');
        if (!cartItems) return;

        // Remove existing listeners by cloning and replacing the element
        const newCartItems = cartItems.cloneNode(true);
        cartItems.parentNode.replaceChild(newCartItems, cartItems);

        // Add click handler
        newCartItems.addEventListener('click', (e) => {
            const button = e.target.closest('button');
            if (!button || !button.dataset.id) return;
            
            const productId = parseInt(button.dataset.id);
            
            if (button.classList.contains('quantity-btn')) {
                const action = button.dataset.action;
                if (button.disabled) {
                    this.showQuantityLimitMessage(action);
                    return;
                }
                this.updateQuantity(productId, action);
                this.animateButton(button);
            } else if (button.classList.contains('remove-btn')) {
                this.removeItemWithAnimation(productId);
            }
        });

        // Add input handler
        newCartItems.addEventListener('input', (e) => {
            if (e.target.classList.contains('quantity-input')) {
                const productId = parseInt(e.target.dataset.id);
                let value = parseInt(e.target.value);

                // Clear any existing timeout
                if (this.quantityUpdateTimeout) {
                    clearTimeout(this.quantityUpdateTimeout);
                }

                // Validate input
                if (isNaN(value) || value < 1) {
                    value = 1;
                } else if (value > 10) {
                    value = 10;
                }

                // Update after a short delay
                this.quantityUpdateTimeout = setTimeout(() => {
                    this.updateQuantityDirectly(productId, value);
                }, 500);
            }
        });
    }

    showQuantityLimitMessage(action) {
        const message = action === 'decrease' ? 
            'Minimum quantity is 1' : 
            'Maximum quantity is 10';
        this.showNotification(message, 'error');
    }

    animateButton(button) {
        button.classList.add('clicked');
        setTimeout(() => button.classList.remove('clicked'), 200);
    }

    updateQuantityDirectly(productId, newQuantity) {
        const currentCart = this.cart;
        const item = currentCart.find(item => item.id === productId);
        if (!item) return;

        if (newQuantity === item.quantity) return;

        if (newQuantity >= 1 && newQuantity <= 10) {
            item.quantity = newQuantity;
            this.cart = currentCart;
            this.displayCart();
            productManager.updateCartCount();
            this.showNotification(`Quantity updated to ${newQuantity}`);
        } else {
            this.showNotification('Quantity must be between 1 and 10', 'error');
            this.displayCart(); // Reset display to valid value
        }
    }

    updateQuantity(productId, action) {
        const currentCart = this.cart;
        const item = currentCart.find(item => item.id === productId);
        if (!item) return;

        let newQuantity = item.quantity;
        
        if (action === 'increase') {
            if (newQuantity < 10) {
                newQuantity += 1;
                this.showNotification(`Quantity updated to ${newQuantity}`);
            } else {
                this.showQuantityLimitMessage('increase');
                return;
            }
        } else if (action === 'decrease') {
            if (newQuantity > 1) {
                newQuantity -= 1;
                this.showNotification(`Quantity updated to ${newQuantity}`);
            } else {
                this.showQuantityLimitMessage('decrease');
                return;
            }
        }

        item.quantity = newQuantity;
        this.cart = currentCart;
        this.displayCart();
        productManager.updateCartCount();
    }

    removeItemWithAnimation(productId) {
        const itemElement = document.querySelector(`.cart-item button[data-id="${productId}"]`).closest('.cart-item');
        itemElement.classList.add('removing');
        
        setTimeout(() => {
            this.removeItem(productId);
        }, 300);
    }

    removeItem(productId) {
        const currentCart = this.cart;
        const item = currentCart.find(item => item.id === productId);
        if (item) {
            const newCart = currentCart.filter(item => item.id !== productId);
            this.cart = newCart;
            this.displayCart();
            productManager.updateCartCount();
            this.showNotification(`${item.name} removed from cart`);
        }
    }

    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('fade-out');
            setTimeout(() => notification.remove(), 300);
        }, 2700);
    }

    handleCheckout() {
        if (!auth.isAuthenticated()) {
            this.showNotification('Please login to checkout', 'error');
            window.location.href = 'index.html';
            return;
        }

        if (this.cart.length === 0) {
            this.showNotification('Your cart is empty', 'error');
            return;
        }

        window.location.href = 'payment.html';
    }
}

// Initialize cart manager and set up page load refresh
const cartManager = new CartManager();

// Refresh cart display when page gains focus
window.addEventListener('focus', () => {
    cartManager.displayCart();
}); 