const API_URL = "/api";

const propertyList = document.getElementById("propertyList");
const loading = document.getElementById("loading");
const errorBox = document.getElementById("error");
const emptyState = document.getElementById("emptyState");

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const refreshBtn = document.getElementById("refreshBtn");

const propertyForm = document.getElementById("propertyForm");

const cacheList = document.getElementById("cacheList");
const clearCacheBtn = document.getElementById("clearCacheBtn");

const cacheStatus = document.getElementById("cacheStatus");


function showLoading() {
    loading.classList.remove("hidden");
}


function hideLoading() {
    loading.classList.add("hidden");
}


function showError(message) {
    errorBox.textContent = message;
    errorBox.classList.remove("hidden");
}


function hideError() {
    errorBox.textContent = "";
    errorBox.classList.add("hidden");
}


function showEmpty() {
    emptyState.classList.remove("hidden");
}


function hideEmpty() {
    emptyState.classList.add("hidden");
}


// Escape HTML to prevent XSS
function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value;
    return div.innerHTML;
}


async function loadProperties(search = "") {

    showLoading();
    hideError();
    hideEmpty();

    propertyList.innerHTML = "";

    try {

        const url = search
            ? `${API_URL}/properties?search=${encodeURIComponent(search)}`
            : `${API_URL}/properties`;

        const response = await fetch(url);

        if (!response.ok) {
            throw new Error("Unable to load properties.");
        }

        const result = await response.json();

        cacheStatus.textContent =
            result.source === "redis"
                ? "Redis Cache HIT"
                : "Database → Redis Cache";

        if (!result.data || result.data.length === 0) {
            showEmpty();
            return;
        }

        result.data.forEach(property => {

            const article = document.createElement("article");

            article.className = "property";

            article.innerHTML = `
                <h3>${escapeHTML(property.title)}</h3>

                <p>
                    <strong>Location:</strong>
                    ${escapeHTML(property.location)}
                </p>

                <p>
                    <strong>Price:</strong>
                    ₹${Number(property.price).toLocaleString("en-IN")}
                </p>

                <p>
                    <strong>Status:</strong>
                    ${escapeHTML(property.status)}
                </p>
            `;

            propertyList.appendChild(article);
        });

    } catch (error) {

        console.error(error);

        showError(
            "Unable to load data. Please check your internet or server connection."
        );

    } finally {

        hideLoading();

    }
}


async function loadCache() {

    try {

        const response = await fetch(`${API_URL}/cache`);

        if (!response.ok) {
            throw new Error("Cache request failed.");
        }

        const result = await response.json();

        cacheList.innerHTML = "";

        if (!result.data || result.data.length === 0) {

            cacheList.textContent = "No cached data found.";

            return;
        }

        result.data.forEach(item => {

            const div = document.createElement("div");

            div.className = "cache-item";

            div.innerHTML = `
                <strong>Key:</strong>
                ${escapeHTML(item.key)}

                <br><br>

                <strong>TTL:</strong>
                ${item.ttl} seconds
            `;

            cacheList.appendChild(div);

        });

    } catch (error) {

        cacheList.textContent =
            "Unable to load Redis cache information.";

    }
}


propertyForm.addEventListener("submit", async (event) => {

    event.preventDefault();

    hideError();

    const title = document.getElementById("title").value.trim();
    const location = document.getElementById("location").value.trim();
    const price = document.getElementById("price").value;
    const status = document.getElementById("status").value;

    if (!title || !location || !price) {

        showError(
            "Please fill in all required fields."
        );

        return;
    }

    if (Number(price) < 0) {

        showError(
            "Price cannot be negative."
        );

        return;
    }

    try {

        const response = await fetch(
            `${API_URL}/properties`,
            {
                method: "POST",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    title,
                    location,
                    price,
                    status
                })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        console.log(
            "[Analytics] User interacted with Redis Caching"
        );

        propertyForm.reset();

        await loadProperties();

        await loadCache();

    } catch (error) {

        showError(
            error.message || "Unable to add property."
        );

    }

});


searchBtn.addEventListener("click", () => {

    const search = searchInput.value.trim();

    loadProperties(search);

});


searchInput.addEventListener("keydown", (event) => {

    if (event.key === "Enter") {

        event.preventDefault();

        const search = searchInput.value.trim();

        loadProperties(search);
    }

});


refreshBtn.addEventListener("click", () => {

    loadProperties(searchInput.value.trim());

    loadCache();

});


clearCacheBtn.addEventListener("click", async () => {

    try {

        const response = await fetch(
            `${API_URL}/cache`,
            {
                method: "DELETE"
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.message);
        }

        console.log(
            "[Analytics] User interacted with Redis Caching"
        );

        await loadCache();

        await loadProperties();

    } catch (error) {

        showError(
            "Unable to clear Redis cache."
        );

    }

});


loadProperties();

loadCache();