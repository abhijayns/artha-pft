const STORAGE_KEY = "bravo-finance-tracker-v3";
const THEME_KEY = "bravo-finance-theme";
const API_BASE = window.__FINANCE_API__ || "http://localhost:8080/api";

const createWorkspace = () => ({ accounts: [], categories: [], budgets: [], goals: [], transactions: [] });
const createData = () => ({
  user: { id: null, name: "", username: "", email: "", currency: "INR" },
  ...createWorkspace()
});
const createStore = () => ({ users: [], activeUserId: null, workspaces: {} });

const state = {
  source: "demo",
  store: createStore(),
  data: createData(),
  ui: {
    theme: localStorage.getItem(THEME_KEY) || "light",
    transactionsExpanded: false,
    filters: { type: "ALL", accountId: "ALL", categoryId: "ALL", month: "", search: "" }
  }
};

const elements = {
  metricsGrid: document.getElementById("metrics-grid"),
  reportInsights: document.getElementById("report-insights"),
  reportCaption: document.getElementById("report-caption"),
  reportMonth: document.getElementById("report-month"),
  modeBadge: document.getElementById("mode-badge"),
  userBadge: document.getElementById("user-badge"),
  heroBalance: document.getElementById("hero-balance"),
  heroCaption: document.getElementById("hero-caption"),
  budgetPulseCaption: document.getElementById("budget-pulse-caption"),
  budgetPulseList: document.getElementById("budget-pulse-list"),
  transactionList: document.getElementById("transaction-list"),
  transactionCount: document.getElementById("transaction-count"),
  transactionForm: document.getElementById("transaction-form"),
  budgetForm: document.getElementById("budget-form"),
  goalForm: document.getElementById("goal-form"),
  profileForm: document.getElementById("profile-form"),
  accountForm: document.getElementById("account-form"),
  categoryForm: document.getElementById("category-form"),
  signInForm: document.getElementById("signin-form"),
  signUpForm: document.getElementById("signup-form"),
  signOutButton: document.getElementById("signout-button"),
  sessionStatus: document.getElementById("session-status"),
  sessionDetail: document.getElementById("session-detail"),
  metricCardTemplate: document.getElementById("metric-card-template"),
  transactionCategory: document.getElementById("transaction-category"),
  transactionAccount: document.getElementById("transaction-account"),
  budgetCategory: document.getElementById("budget-category"),
  transactionHelper: document.getElementById("transaction-helper"),
  themeToggle: document.getElementById("theme-toggle"),
  filterType: document.getElementById("filter-type"),
  filterAccount: document.getElementById("filter-account"),
  filterCategory: document.getElementById("filter-category"),
  filterMonth: document.getElementById("filter-month"),
  filterSearch: document.getElementById("filter-search"),
  clearFilters: document.getElementById("clear-filters"),
  toggleTransactions: document.getElementById("toggle-transactions")
};

document.addEventListener("DOMContentLoaded", async () => {
  applyTheme();
  bindScrollButtons();
  setDefaultDates();
  await boot();
  bindEvents();
  hydrateProfileForm();
  render();
});

async function boot() {
  try {
    const liveData = await fetchBootstrap();
    state.source = "oracle";
    state.data = normalizeIncomingState(liveData);
  } catch {
    const saved = localStorage.getItem(STORAGE_KEY);
    state.store = saved ? normalizeStore(JSON.parse(saved)) : createStore();
    loadActiveUserData();
  }
}

function bindEvents() {
  elements.signInForm.addEventListener("submit", handleSignIn);
  elements.signUpForm.addEventListener("submit", handleSignUp);
  elements.signOutButton.addEventListener("click", handleSignOut);
  elements.profileForm.addEventListener("submit", handleProfileSubmit);
  elements.accountForm.addEventListener("submit", handleAccountSubmit);
  elements.categoryForm.addEventListener("submit", handleCategorySubmit);
  elements.transactionForm.addEventListener("submit", handleTransactionSubmit);
  elements.budgetForm.addEventListener("submit", handleBudgetSubmit);
  elements.goalForm.addEventListener("submit", handleGoalSubmit);
  elements.reportMonth.addEventListener("change", render);
  elements.transactionForm.transactionType.addEventListener("change", () => {
    syncCategoryOptions();
    updateTransactionFormState();
  });
  elements.themeToggle.addEventListener("click", toggleTheme);
  elements.filterType.addEventListener("change", handleFilterChange);
  elements.filterAccount.addEventListener("change", handleFilterChange);
  elements.filterCategory.addEventListener("change", handleFilterChange);
  elements.filterMonth.addEventListener("change", handleFilterChange);
  elements.filterSearch.addEventListener("input", handleFilterChange);
  elements.clearFilters.addEventListener("click", clearTransactionFilters);
  elements.toggleTransactions.addEventListener("click", toggleTransactionsExpanded);
}

function bindScrollButtons() {
  document.querySelectorAll("[data-scroll-target]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = document.querySelector(button.dataset.scrollTarget);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
}

function setDefaultDates() {
  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const monthValue = isoDate.slice(0, 7);
  elements.transactionForm.transactionDate.value = isoDate;
  elements.reportMonth.value = monthValue;
  elements.budgetForm.budgetMonth.value = monthValue;
  elements.goalForm.targetDate.value = new Date(today.getFullYear(), today.getMonth() + 4, today.getDate()).toISOString().slice(0, 10);
}

function hydrateProfileForm() {
  elements.profileForm.userName.value = state.data.user.name || "";
  elements.profileForm.currency.value = state.data.user.currency || "INR";
}

const isSignedIn = () => state.data.user.id !== null;
const getActiveUser = () => state.store.users.find((user) => user.id === state.store.activeUserId) || null;
const nextId = (collection) => collection.length ? Math.max(...collection.map((entry) => Number(entry.id))) + 1 : 1;

function normalizeStore(store) {
  return { users: Array.isArray(store.users) ? store.users : [], activeUserId: store.activeUserId || null, workspaces: store.workspaces || {} };
}

function loadActiveUserData() {
  const activeUser = getActiveUser();
  if (!activeUser) {
    state.data = createData();
    return;
  }
  state.data = {
    user: {
      id: activeUser.id,
      name: activeUser.name,
      username: activeUser.username,
      email: activeUser.email,
      currency: activeUser.currency
    },
    ...clone(state.store.workspaces[String(activeUser.id)] || createWorkspace())
  };
  recalculateAccountBalances();
}

function persistLocalState() {
  if (state.source !== "demo") return;
  if (isSignedIn()) {
    const userIndex = state.store.users.findIndex((user) => user.id === state.data.user.id);
    if (userIndex >= 0) {
      state.store.users[userIndex] = { ...state.store.users[userIndex], name: state.data.user.name, currency: state.data.user.currency };
    }
    state.store.workspaces[String(state.data.user.id)] = {
      accounts: state.data.accounts,
      categories: state.data.categories,
      budgets: state.data.budgets,
      goals: state.data.goals,
      transactions: state.data.transactions
    };
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state.store));
}

async function fetchBootstrap() {
  const response = await fetch(`${API_BASE}/bootstrap`);
  if (!response.ok) throw new Error("Backend unavailable");
  return response.json();
}

async function postToApi(endpoint, payload) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!response.ok) throw new Error((await response.text()) || "Request failed");
  return response.json();
}

function handleSignUp(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("signupUsername")).trim();
  const email = String(formData.get("signupEmail")).trim().toLowerCase();
  if (state.store.users.some((user) => user.username.toLowerCase() === username.toLowerCase())) return window.alert("That username is already taken.");
  if (state.store.users.some((user) => user.email.toLowerCase() === email)) return window.alert("That email is already registered.");

  const userId = nextId(state.store.users);
  state.store.users.push({
    id: userId,
    name: String(formData.get("signupName")).trim(),
    username,
    email,
    password: String(formData.get("signupPassword")),
    currency: formData.get("signupCurrency"),
    createdAt: new Date().toISOString()
  });
  state.store.workspaces[String(userId)] = createWorkspace();
  state.store.activeUserId = userId;
  loadActiveUserData();
  persistLocalState();
  event.currentTarget.reset();
  hydrateProfileForm();
  clearTransactionFilters();
  render();
}

function handleSignIn(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const username = String(formData.get("signinUsername")).trim().toLowerCase();
  const password = String(formData.get("signinPassword"));
  const user = state.store.users.find((entry) => entry.username.toLowerCase() === username && entry.password === password);
  if (!user) return window.alert("Invalid username or password.");
  state.store.activeUserId = user.id;
  loadActiveUserData();
  persistLocalState();
  event.currentTarget.reset();
  hydrateProfileForm();
  clearTransactionFilters();
  render();
}

function handleSignOut() {
  state.store.activeUserId = null;
  state.data = createData();
  persistLocalState();
  hydrateProfileForm();
  clearTransactionFilters();
  render();
}

function handleProfileSubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to edit a profile.");
  const formData = new FormData(event.currentTarget);
  state.data.user = { ...state.data.user, name: String(formData.get("userName")).trim(), currency: formData.get("currency") };
  persistLocalState();
  render();
}

function handleAccountSubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to add accounts.");
  const formData = new FormData(event.currentTarget);
  const accountName = String(formData.get("accountName")).trim();
  if (state.data.accounts.some((account) => account.name.toLowerCase() === accountName.toLowerCase())) return window.alert("An account with that name already exists for this user.");
  const openingBalance = Number(formData.get("openingBalance") || 0);
  state.data.accounts.unshift({ id: nextId(state.data.accounts), name: accountName, type: formData.get("accountType"), openingBalance, currentBalance: openingBalance });
  persistLocalState();
  event.currentTarget.reset();
  render();
}

function handleCategorySubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to add categories.");
  const formData = new FormData(event.currentTarget);
  const categoryName = String(formData.get("categoryName")).trim();
  const categoryType = formData.get("categoryType");
  if (state.data.categories.some((category) => category.name.toLowerCase() === categoryName.toLowerCase() && category.type === categoryType)) return window.alert("That category already exists for this user.");
  state.data.categories.unshift({ id: nextId(state.data.categories), name: categoryName, type: categoryType, defaultLimit: Number(formData.get("defaultLimit") || 0) });
  persistLocalState();
  event.currentTarget.reset();
  render();
}

async function handleTransactionSubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to add transactions.");
  const formData = new FormData(event.currentTarget);
  const payload = {
    accountId: Number(formData.get("accountId")),
    categoryId: Number(formData.get("categoryId")),
    type: formData.get("transactionType"),
    amount: Number(formData.get("amount")),
    date: formData.get("transactionDate"),
    description: String(formData.get("description")).trim(),
    paymentMode: formData.get("paymentMode")
  };

  try {
    if (state.source === "oracle") {
      await postToApi("/transactions", { userId: state.data.user.id, ...payload });
      state.data = normalizeIncomingState(await fetchBootstrap());
    } else {
      addLocalTransaction(payload);
    }
    event.currentTarget.reset();
    setDefaultDates();
    syncCategoryOptions();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleBudgetSubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to add budget rules.");
  const formData = new FormData(event.currentTarget);
  const payload = {
    categoryId: Number(formData.get("categoryId")),
    month: formData.get("budgetMonth"),
    limit: Number(formData.get("budgetLimit")),
    warningPercent: Number(formData.get("warningPercent"))
  };

  try {
    if (state.source === "oracle") {
      await postToApi("/budgets", { userId: state.data.user.id, ...payload });
      state.data = normalizeIncomingState(await fetchBootstrap());
    } else {
      addLocalBudget(payload);
    }
    event.currentTarget.reset();
    setDefaultDates();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

async function handleGoalSubmit(event) {
  event.preventDefault();
  if (!isSignedIn()) return window.alert("Sign in first to add goals.");
  const formData = new FormData(event.currentTarget);
  const payload = {
    name: String(formData.get("goalName")).trim(),
    targetAmount: Number(formData.get("targetAmount")),
    targetDate: formData.get("targetDate")
  };

  try {
    if (state.source === "oracle") {
      await postToApi("/goals", { userId: state.data.user.id, ...payload });
      state.data = normalizeIncomingState(await fetchBootstrap());
    } else {
      addLocalGoal(payload);
    }
    event.currentTarget.reset();
    setDefaultDates();
    render();
  } catch (error) {
    window.alert(error.message);
  }
}

function addLocalTransaction(payload) {
  ensureTransactionSetup(payload.type, payload.categoryId, payload.accountId);
  if (payload.type === "EXPENSE") enforceBudgetRule(payload);
  state.data.transactions.unshift({ id: nextId(state.data.transactions), ...payload });
  recalculateAccountBalances();
  persistLocalState();
}

function addLocalBudget(payload) {
  const category = findCategory(payload.categoryId);
  if (!category || category.type !== "EXPENSE") throw new Error("Select a valid expense category before creating a budget rule.");
  const existing = state.data.budgets.find((budget) => budget.categoryId === payload.categoryId && budget.month === payload.month);
  if (existing) {
    existing.limit = payload.limit;
    existing.warningPercent = payload.warningPercent;
  } else {
    state.data.budgets.unshift({ id: nextId(state.data.budgets), ...payload });
  }
  persistLocalState();
}

function addLocalGoal(payload) {
  state.data.goals.unshift({ id: nextId(state.data.goals), name: payload.name, targetAmount: payload.targetAmount, currentAmount: 0, targetDate: payload.targetDate, status: "ACTIVE" });
  persistLocalState();
}

function ensureTransactionSetup(type, categoryId, accountId) {
  const category = findCategory(categoryId);
  const account = findAccount(accountId);
  if (!account) throw new Error("Please add an account before recording a transaction.");
  if (!category) throw new Error("Please add a category before recording a transaction.");
  if (category.type !== type) throw new Error("Transaction type must match the selected category.");
}

function enforceBudgetRule(transaction) {
  const monthKey = transaction.date.slice(0, 7);
  const budget = state.data.budgets.find((entry) => entry.categoryId === transaction.categoryId && entry.month === monthKey);
  if (!budget) return;
  const existingSpend = state.data.transactions
    .filter((entry) => entry.type === "EXPENSE" && entry.categoryId === transaction.categoryId && entry.date.startsWith(monthKey))
    .reduce((total, entry) => total + entry.amount, 0);
  if (existingSpend + transaction.amount > budget.limit) throw new Error("This expense crosses the monthly budget limit configured for that category.");
}

function render() {
  hydrateProfileForm();
  populateSelects();
  populateTransactionFilters();
  updateAuthState();
  updateTransactionFormState();
  renderHeader();
  renderMetrics();
  renderBudgetPulse();
  renderReport();
  renderTransactions();
}

function updateAuthState() {
  const signedIn = isSignedIn();
  const activeUser = getActiveUser();
  elements.sessionStatus.textContent = signedIn ? `Signed in as ${activeUser.username}` : "No profile signed in";
  elements.sessionDetail.textContent = signedIn
    ? `${activeUser.email} | This profile has its own separate history.`
    : "Create a profile or sign in to access your own accounts, budgets, goals, and transactions.";
  elements.signOutButton.disabled = !signedIn;

  [
    elements.profileForm,
    elements.accountForm,
    elements.categoryForm,
    elements.transactionForm,
    elements.budgetForm,
    elements.goalForm
  ].forEach((form) => setFormDisabled(form, !signedIn));
}

function setFormDisabled(form, disabled) {
  form.querySelectorAll("input, select, button").forEach((control) => {
    control.disabled = disabled;
  });
}

function populateSelects() {
  syncCategoryOptions();
  hydrateSelect(
    elements.transactionAccount,
    state.data.accounts.map((account) => ({ value: account.id, label: `${account.name} (${account.type})` })),
    isSignedIn() ? "Add an account first" : "Sign in first"
  );
  hydrateSelect(
    elements.budgetCategory,
    getExpenseCategories().map((category) => ({ value: category.id, label: category.name })),
    isSignedIn() ? "Add an expense category first" : "Sign in first"
  );
}

function syncCategoryOptions() {
  const currentType = elements.transactionForm.transactionType.value;
  hydrateSelect(
    elements.transactionCategory,
    state.data.categories.filter((category) => category.type === currentType).map((category) => ({ value: category.id, label: category.name })),
    isSignedIn() ? `Add a ${currentType.toLowerCase()} category first` : "Sign in first"
  );
}

function hydrateSelect(select, options, placeholder) {
  const previous = select.value;
  const markup = [];
  if (!options.length && placeholder) markup.push(`<option value="">${placeholder}</option>`);
  select.innerHTML = markup.concat(options.map((option) => `<option value="${option.value}">${option.label}</option>`)).join("");
  select.disabled = options.length === 0;
  if (options.some((option) => String(option.value) === previous)) select.value = previous;
}

function populateTransactionFilters() {
  hydrateStaticSelect(
    elements.filterAccount,
    state.data.accounts.map((account) => ({ value: String(account.id), label: account.name })),
    "All accounts",
    state.ui.filters.accountId
  );
  hydrateStaticSelect(
    elements.filterCategory,
    state.data.categories.map((category) => ({ value: String(category.id), label: `${category.name} (${capitalize(category.type)})` })),
    "All categories",
    state.ui.filters.categoryId
  );
  elements.filterType.value = state.ui.filters.type;
  elements.filterMonth.value = state.ui.filters.month;
  elements.filterSearch.value = state.ui.filters.search;
}

function hydrateStaticSelect(select, options, allLabel, selectedValue) {
  select.innerHTML = [`<option value="ALL">${allLabel}</option>`]
    .concat(options.map((option) => `<option value="${option.value}">${option.label}</option>`))
    .join("");
  select.value = options.some((option) => option.value === selectedValue) ? selectedValue : "ALL";
}

function updateTransactionFormState() {
  const signedIn = isSignedIn();
  const hasAccounts = state.data.accounts.length > 0;
  const hasMatchingCategories = state.data.categories.some((category) => category.type === elements.transactionForm.transactionType.value);
  const canSubmit = signedIn && hasAccounts && hasMatchingCategories;

  elements.transactionForm.querySelector('button[type="submit"]').disabled = !canSubmit;
  if (!signedIn) {
    elements.transactionHelper.textContent = "Sign in to start recording user-specific transactions and history.";
    elements.transactionHelper.className = "form-message is-warning";
  } else if (canSubmit) {
    elements.transactionHelper.textContent = "Ready to record a transaction for the active profile.";
    elements.transactionHelper.className = "form-message is-ready";
  } else {
    elements.transactionHelper.textContent = "Add at least one account and a matching category to unlock transaction entry.";
    elements.transactionHelper.className = "form-message is-warning";
  }

  elements.budgetForm.querySelector('button[type="submit"]').disabled = !signedIn || getExpenseCategories().length === 0;
  elements.goalForm.querySelector('button[type="submit"]').disabled = !signedIn;
}

function renderHeader() {
  const selectedMonth = getSelectedMonth();
  const overview = calculateOverview(selectedMonth);
  const userName = isSignedIn() ? state.data.user.name : "Sign in to continue";
  elements.modeBadge.textContent = state.source === "oracle" ? "Oracle Connected" : "";
  elements.modeBadge.className = state.source === "oracle" ? "status-pill" : "status-pill neutral";
  elements.modeBadge.hidden = state.source !== "oracle";
  elements.userBadge.textContent = `${userName} | ${selectedMonth}`;
  elements.heroBalance.textContent = formatCurrency(overview.totalBalance);
  elements.heroCaption.textContent = isSignedIn()
    ? `${formatCurrency(overview.monthlyIncome)} in, ${formatCurrency(overview.monthlyExpenses)} out this month`
    : "Create a profile or sign in to access a separate finance history for each user.";
  elements.themeToggle.textContent = state.ui.theme === "dark" ? "Light Mode" : "Dark Mode";
}

function renderMetrics() {
  const selectedMonth = getSelectedMonth();
  const overview = calculateOverview(selectedMonth);
  const cards = [
    { label: "Monthly Income", value: formatCurrency(overview.monthlyIncome), footnote: "Only for the signed-in user" },
    { label: "Monthly Expenses", value: formatCurrency(overview.monthlyExpenses), footnote: "Only for the signed-in user" },
    { label: "Savings Rate", value: `${overview.savingsRate}%`, footnote: "Calculated from the active profile history" },
    { label: "Active Goals", value: String(state.data.goals.filter((goal) => goal.status === "ACTIVE").length), footnote: "Goals linked to the current profile" }
  ];
  elements.metricsGrid.innerHTML = "";
  cards.forEach((card) => {
    const node = elements.metricCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector(".metric-label").textContent = card.label;
    node.querySelector(".metric-value").textContent = card.value;
    node.querySelector(".metric-footnote").textContent = card.footnote;
    elements.metricsGrid.appendChild(node);
  });
}

function renderBudgetPulse() {
  const budgets = getBudgetUsage(getSelectedMonth()).slice(0, 3);
  elements.budgetPulseCaption.textContent = `${budgets.length} tracked categories`;
  elements.budgetPulseList.innerHTML = budgets.length
    ? budgets.map(renderBudgetPulseItem).join("")
    : renderEmptyState(isSignedIn() ? "No budget rules saved for this month yet." : "Sign in to see budget status.");
}

function renderReport() {
  const overview = calculateOverview(getSelectedMonth());
  const categories = getBudgetUsage(getSelectedMonth());
  const topExpense = [...categories].sort((left, right) => right.spent - left.spent)[0];
  const reportItems = [
    { label: "Net Position", value: formatCurrency(overview.monthlyIncome - overview.monthlyExpenses) },
    { label: "Top Expense Category", value: topExpense ? `${topExpense.categoryName} (${formatCurrency(topExpense.spent)})` : "No expense data" },
    { label: "Budget Utilisation", value: `${Math.min(999, overview.budgetUtilisation)}%` },
    { label: "Goal Progress", value: `${averageGoalProgress()}% average` }
  ];
  elements.reportCaption.textContent = `Insights for ${getSelectedMonth()}`;
  elements.reportInsights.innerHTML = reportItems.map((item) => `<div class="report-chip"><span>${item.label}</span><strong>${item.value}</strong></div>`).join("");
}

function renderTransactions() {
  const filteredTransactions = getFilteredTransactions();
  const visibleTransactions = state.ui.transactionsExpanded ? filteredTransactions : filteredTransactions.slice(0, 5);
  if (!filteredTransactions.length) {
    elements.transactionCount.textContent = isSignedIn() ? "0 matching entries" : "No active profile";
    elements.toggleTransactions.textContent = "View All";
    elements.toggleTransactions.disabled = true;
    elements.transactionList.innerHTML = renderEmptyState(isSignedIn() ? "No transactions match the selected filters." : "Sign in to view transactions for a specific profile.");
    return;
  }

  elements.transactionCount.textContent = state.ui.transactionsExpanded
    ? `Showing all ${filteredTransactions.length} matching transactions`
    : `Showing ${visibleTransactions.length} of ${filteredTransactions.length} matching transactions`;
  elements.toggleTransactions.disabled = filteredTransactions.length <= 5;
  elements.toggleTransactions.textContent = state.ui.transactionsExpanded ? "Show Less" : "View All";
  elements.transactionList.innerHTML = visibleTransactions.map(renderTransactionItem).join("");
}

function renderTransactionItem(entry) {
  const category = findCategory(entry.categoryId);
  const account = findAccount(entry.accountId);
  return `
    <article class="transaction-item">
      <div>
        <p class="transaction-title">${entry.description}</p>
        <div class="transaction-meta">${entry.date} | ${category?.name || "Unknown"} | ${account?.name || "Account"} | ${entry.paymentMode}</div>
      </div>
      <div class="transaction-amount ${entry.type === "INCOME" ? "income" : "expense"}">
        ${entry.type === "INCOME" ? "+" : "-"} ${formatCurrency(entry.amount)}
      </div>
    </article>
  `;
}

function renderBudgetPulseItem(budget) {
  return `
    <div class="budget-card ${budget.percentUsed >= budget.warningPercent ? "alert" : ""}">
      <p class="budget-title">${budget.categoryName}</p>
      <div class="budget-progress"><span style="width: ${Math.min(100, budget.percentUsed)}%"></span></div>
      <div class="budget-meta">
        <span>${Math.round(budget.percentUsed)}% used</span>
        <span>${formatCurrency(budget.limit)}</span>
      </div>
    </div>
  `;
}

function getFilteredTransactions() {
  if (!isSignedIn()) return [];
  return [...state.data.transactions]
    .filter((entry) => state.ui.filters.type === "ALL" || entry.type === state.ui.filters.type)
    .filter((entry) => state.ui.filters.accountId === "ALL" || String(entry.accountId) === state.ui.filters.accountId)
    .filter((entry) => state.ui.filters.categoryId === "ALL" || String(entry.categoryId) === state.ui.filters.categoryId)
    .filter((entry) => !state.ui.filters.month || entry.date.startsWith(state.ui.filters.month))
    .filter((entry) => {
      if (!state.ui.filters.search) return true;
      const haystack = `${entry.description} ${entry.paymentMode} ${findCategory(entry.categoryId)?.name || ""} ${findAccount(entry.accountId)?.name || ""}`.toLowerCase();
      return haystack.includes(state.ui.filters.search.toLowerCase());
    })
    .sort((left, right) => right.date.localeCompare(left.date));
}

function calculateOverview(selectedMonth) {
  const monthTransactions = state.data.transactions.filter((entry) => entry.date.startsWith(selectedMonth));
  const monthlyIncome = monthTransactions.filter((entry) => entry.type === "INCOME").reduce((sum, entry) => sum + entry.amount, 0);
  const monthlyExpenses = monthTransactions.filter((entry) => entry.type === "EXPENSE").reduce((sum, entry) => sum + entry.amount, 0);
  const totalBalance = state.data.accounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const totalBudget = getBudgetUsage(selectedMonth).reduce((sum, entry) => sum + entry.limit, 0);
  return {
    monthlyIncome,
    monthlyExpenses,
    totalBalance,
    savingsRate: monthlyIncome ? Math.max(0, Math.round(((monthlyIncome - monthlyExpenses) / monthlyIncome) * 100)) : 0,
    budgetUtilisation: totalBudget ? Math.round((monthlyExpenses / totalBudget) * 100) : 0
  };
}

function getBudgetUsage(selectedMonth) {
  return state.data.budgets
    .filter((budget) => budget.month === selectedMonth)
    .map((budget) => {
      const spent = state.data.transactions
        .filter((entry) => entry.type === "EXPENSE" && entry.categoryId === budget.categoryId && entry.date.startsWith(selectedMonth))
        .reduce((sum, entry) => sum + entry.amount, 0);
      return { ...budget, spent, percentUsed: budget.limit ? (spent / budget.limit) * 100 : 0, categoryName: findCategory(budget.categoryId)?.name || "Unknown" };
    });
}

function averageGoalProgress() {
  if (!state.data.goals.length) return 0;
  const total = state.data.goals.reduce((sum, goal) => sum + ((goal.currentAmount / goal.targetAmount) * 100), 0);
  return Math.round(total / state.data.goals.length);
}

function recalculateAccountBalances() {
  state.data.accounts.forEach((account) => {
    const delta = state.data.transactions
      .filter((entry) => entry.accountId === account.id)
      .reduce((sum, entry) => sum + (entry.type === "INCOME" ? entry.amount : -entry.amount), 0);
    account.currentBalance = Number((account.openingBalance + delta).toFixed(2));
  });
}

function normalizeIncomingState(payload) {
  return {
    user: {
      id: payload.user?.id || payload.user?.user_id || null,
      name: payload.user?.name || payload.user?.full_name || "",
      username: payload.user?.username || payload.user?.login_name || "",
      email: payload.user?.email || "",
      currency: payload.user?.currency || payload.user?.base_currency || "INR"
    },
    accounts: Array.isArray(payload.accounts) ? payload.accounts.map((account) => ({
      id: account.id || account.account_id,
      name: account.name || account.account_name,
      type: account.type || account.account_type,
      openingBalance: Number(account.openingBalance ?? account.opening_balance ?? 0),
      currentBalance: Number(account.currentBalance ?? account.current_balance ?? account.openingBalance ?? account.opening_balance ?? 0)
    })) : [],
    categories: Array.isArray(payload.categories) ? payload.categories.map((category) => ({
      id: category.id || category.category_id,
      name: category.name || category.category_name,
      type: category.type || category.category_type,
      defaultLimit: Number(category.defaultLimit ?? category.default_monthly_limit ?? 0)
    })) : [],
    budgets: Array.isArray(payload.budgets) ? payload.budgets.map((budget) => ({
      id: budget.id || budget.budget_id,
      categoryId: budget.categoryId || budget.category_id,
      month: (budget.month || budget.budget_month_key || "").toString().slice(0, 7),
      limit: Number(budget.limit ?? budget.budget_limit ?? 0),
      warningPercent: Number(budget.warningPercent ?? budget.warning_percent ?? 80)
    })) : [],
    goals: Array.isArray(payload.goals) ? payload.goals.map((goal) => ({
      id: goal.id || goal.goal_id,
      name: goal.name || goal.goal_name,
      targetAmount: Number(goal.targetAmount ?? goal.target_amount ?? 0),
      currentAmount: Number(goal.currentAmount ?? goal.current_amount ?? 0),
      targetDate: (goal.targetDate || goal.target_date || "").toString().slice(0, 10),
      status: goal.status || "ACTIVE"
    })) : [],
    transactions: Array.isArray(payload.transactions) ? payload.transactions.map((entry) => ({
      id: entry.id || entry.transaction_id,
      accountId: entry.accountId || entry.account_id,
      categoryId: entry.categoryId || entry.category_id,
      type: entry.type || entry.transaction_type,
      amount: Number(entry.amount ?? 0),
      date: (entry.date || entry.transaction_date || "").toString().slice(0, 10),
      description: entry.description || "",
      paymentMode: entry.paymentMode || entry.payment_mode || "UPI"
    })) : []
  };
}

function handleFilterChange() {
  state.ui.filters = {
    type: elements.filterType.value,
    accountId: elements.filterAccount.value,
    categoryId: elements.filterCategory.value,
    month: elements.filterMonth.value,
    search: elements.filterSearch.value.trim()
  };
  state.ui.transactionsExpanded = false;
  renderTransactions();
}

function clearTransactionFilters() {
  state.ui.filters = { type: "ALL", accountId: "ALL", categoryId: "ALL", month: "", search: "" };
  state.ui.transactionsExpanded = false;
  populateTransactionFilters();
  renderTransactions();
}

function toggleTransactionsExpanded() {
  state.ui.transactionsExpanded = !state.ui.transactionsExpanded;
  renderTransactions();
}

function applyTheme() {
  document.body.setAttribute("data-theme", state.ui.theme);
}

function toggleTheme() {
  state.ui.theme = state.ui.theme === "dark" ? "light" : "dark";
  localStorage.setItem(THEME_KEY, state.ui.theme);
  applyTheme();
  renderHeader();
}

function findCategory(categoryId) {
  return state.data.categories.find((category) => category.id === Number(categoryId));
}

function findAccount(accountId) {
  return state.data.accounts.find((account) => account.id === Number(accountId));
}

function getExpenseCategories() {
  return state.data.categories.filter((category) => category.type === "EXPENSE");
}

function getSelectedMonth() {
  return elements.reportMonth.value || new Date().toISOString().slice(0, 7);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: state.data.user.currency || "INR",
    maximumFractionDigits: 2
  }).format(value || 0);
}

function renderEmptyState(message) {
  return `<div class="empty-state">${message}</div>`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}
