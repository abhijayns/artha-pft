INSERT INTO app_user (login_name, full_name, email, password_hash, base_currency, profile_status)
VALUES ('nikhil', 'Pusapati Nikhil', 'nikhil@example.com', 'demo_hash_nikhil', 'INR', 'ACTIVE');

INSERT INTO app_user (login_name, full_name, email, password_hash, base_currency, profile_status)
VALUES ('abhijay', 'Abhijay N S', 'abhijay@example.com', 'demo_hash_abhijay', 'INR', 'ACTIVE');

INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Salary', 'INCOME', NULL, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Freelance', 'INCOME', NULL, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Food', 'EXPENSE', 8000, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Transport', 'EXPENSE', 4500, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Rent', 'EXPENSE', 18000, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Utilities', 'EXPENSE', 3500, 'Y');
INSERT INTO category (category_name, category_type, default_monthly_limit, is_system_generated) VALUES ('Entertainment', 'EXPENSE', 4000, 'Y');

INSERT INTO account (user_id, account_name, account_type, opening_balance, current_balance)
VALUES (1, 'Main Savings', 'BANK', 42000, 42000);

INSERT INTO account (user_id, account_name, account_type, opening_balance, current_balance)
VALUES (1, 'Pocket Wallet', 'CASH', 3000, 3000);

BEGIN
    finance_tracker_pkg.pr_upsert_budget(1, 3, DATE '2026-03-01', 8000, 80);
    finance_tracker_pkg.pr_upsert_budget(1, 4, DATE '2026-03-01', 4500, 85);
    finance_tracker_pkg.pr_upsert_budget(1, 5, DATE '2026-03-01', 18000, 90);
END;
/

BEGIN
    finance_tracker_pkg.pr_add_transaction(1, 1, 1, 'INCOME', 65000, DATE '2026-03-01', 'BANK_TRANSFER', 'Monthly stipend');
    finance_tracker_pkg.pr_add_transaction(1, 1, 5, 'EXPENSE', 18000, DATE '2026-03-03', 'BANK_TRANSFER', 'Apartment rent');
    finance_tracker_pkg.pr_add_transaction(1, 2, 3, 'EXPENSE', 2450, DATE '2026-03-06', 'UPI', 'Groceries and dinner');
    finance_tracker_pkg.pr_add_transaction(1, 2, 4, 'EXPENSE', 960, DATE '2026-03-08', 'UPI', 'Cab rides');
END;
/

INSERT INTO savings_goal (user_id, goal_name, target_amount, current_amount, target_date, status)
VALUES (1, 'Emergency Fund', 100000, 54000, DATE '2026-08-30', 'ACTIVE');

INSERT INTO savings_goal (user_id, goal_name, target_amount, current_amount, target_date, status)
VALUES (1, 'Laptop Upgrade', 85000, 27000, DATE '2026-10-15', 'ACTIVE');

SELECT *
FROM vw_monthly_cashflow
WHERE user_id = 1
ORDER BY report_month DESC;

SELECT
    category_name,
    amount_spent,
    budget_limit,
    amount_remaining
FROM vw_budget_status
WHERE user_id = 1
  AND budget_month_key = DATE '2026-03-01'
ORDER BY amount_spent DESC;

SELECT
    c.category_name,
    SUM(t.amount) AS total_spent
FROM transaction_entry t
JOIN category c
    ON c.category_id = t.category_id
WHERE t.user_id = 1
  AND t.transaction_type = 'EXPENSE'
  AND TRUNC(t.transaction_date, 'MM') = DATE '2026-03-01'
GROUP BY c.category_name
HAVING SUM(t.amount) > 1000
ORDER BY total_spent DESC;

SELECT
    goal_name,
    current_amount,
    target_amount,
    completion_percent
FROM vw_goal_progress
WHERE user_id = 1
ORDER BY completion_percent DESC;

SELECT
    category_name,
    amount_spent
FROM (
    SELECT
        c.category_name,
        SUM(t.amount) AS amount_spent,
        RANK() OVER (ORDER BY SUM(t.amount) DESC) AS spend_rank
    FROM transaction_entry t
    JOIN category c
        ON c.category_id = t.category_id
    WHERE t.user_id = 1
      AND t.transaction_type = 'EXPENSE'
      AND TRUNC(t.transaction_date, 'MM') = DATE '2026-03-01'
    GROUP BY c.category_name
)
WHERE spend_rank = 1;
