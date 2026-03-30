CREATE OR REPLACE PACKAGE finance_tracker_pkg AS
    FUNCTION fn_category_spend (
        p_user_id IN NUMBER,
        p_category_id IN NUMBER,
        p_month IN DATE
    ) RETURN NUMBER;

    FUNCTION fn_savings_rate (
        p_user_id IN NUMBER,
        p_month IN DATE
    ) RETURN NUMBER;

    PROCEDURE pr_upsert_budget (
        p_user_id IN NUMBER,
        p_category_id IN NUMBER,
        p_budget_month IN DATE,
        p_budget_limit IN NUMBER,
        p_warning_percent IN NUMBER
    );

    PROCEDURE pr_add_transaction (
        p_user_id IN NUMBER,
        p_account_id IN NUMBER,
        p_category_id IN NUMBER,
        p_transaction_type IN VARCHAR2,
        p_amount IN NUMBER,
        p_transaction_date IN DATE,
        p_payment_mode IN VARCHAR2,
        p_description IN VARCHAR2
    );

    PROCEDURE pr_monthly_report (
        p_user_id IN NUMBER,
        p_month IN DATE,
        p_report OUT SYS_REFCURSOR
    );
END finance_tracker_pkg;
/

CREATE OR REPLACE PACKAGE BODY finance_tracker_pkg AS
    FUNCTION fn_category_spend (
        p_user_id IN NUMBER,
        p_category_id IN NUMBER,
        p_month IN DATE
    ) RETURN NUMBER IS
        v_total NUMBER(12,2);
    BEGIN
        SELECT NVL(SUM(amount), 0)
        INTO v_total
        FROM transaction_entry
        WHERE user_id = p_user_id
          AND category_id = p_category_id
          AND transaction_type = 'EXPENSE'
          AND TRUNC(transaction_date, 'MM') = TRUNC(p_month, 'MM');

        RETURN v_total;
    END fn_category_spend;

    FUNCTION fn_savings_rate (
        p_user_id IN NUMBER,
        p_month IN DATE
    ) RETURN NUMBER IS
        v_income NUMBER(12,2);
        v_expense NUMBER(12,2);
    BEGIN
        SELECT
            NVL(SUM(CASE WHEN transaction_type = 'INCOME' THEN amount END), 0),
            NVL(SUM(CASE WHEN transaction_type = 'EXPENSE' THEN amount END), 0)
        INTO v_income, v_expense
        FROM transaction_entry
        WHERE user_id = p_user_id
          AND TRUNC(transaction_date, 'MM') = TRUNC(p_month, 'MM');

        IF v_income = 0 THEN
            RETURN 0;
        END IF;

        RETURN ROUND(((v_income - v_expense) / v_income) * 100, 2);
    END fn_savings_rate;

    PROCEDURE pr_upsert_budget (
        p_user_id IN NUMBER,
        p_category_id IN NUMBER,
        p_budget_month IN DATE,
        p_budget_limit IN NUMBER,
        p_warning_percent IN NUMBER
    ) IS
    BEGIN
        MERGE INTO budget b
        USING (
            SELECT
                p_user_id AS user_id,
                p_category_id AS category_id,
                TRUNC(p_budget_month, 'MM') AS budget_month,
                p_budget_limit AS budget_limit,
                p_warning_percent AS warning_percent
            FROM dual
        ) src
        ON (
            b.user_id = src.user_id
            AND b.category_id = src.category_id
            AND b.budget_month_key = src.budget_month
        )
        WHEN MATCHED THEN
            UPDATE SET
                b.budget_month = src.budget_month,
                b.budget_limit = src.budget_limit,
                b.warning_percent = src.warning_percent
        WHEN NOT MATCHED THEN
            INSERT (user_id, category_id, budget_month, budget_limit, warning_percent)
            VALUES (src.user_id, src.category_id, src.budget_month, src.budget_limit, src.warning_percent);
    END pr_upsert_budget;

    PROCEDURE pr_add_transaction (
        p_user_id IN NUMBER,
        p_account_id IN NUMBER,
        p_category_id IN NUMBER,
        p_transaction_type IN VARCHAR2,
        p_amount IN NUMBER,
        p_transaction_date IN DATE,
        p_payment_mode IN VARCHAR2,
        p_description IN VARCHAR2
    ) IS
    BEGIN
        INSERT INTO transaction_entry (
            user_id,
            account_id,
            category_id,
            transaction_type,
            amount,
            transaction_date,
            payment_mode,
            description
        ) VALUES (
            p_user_id,
            p_account_id,
            p_category_id,
            UPPER(p_transaction_type),
            p_amount,
            p_transaction_date,
            UPPER(p_payment_mode),
            p_description
        );
    END pr_add_transaction;

    PROCEDURE pr_monthly_report (
        p_user_id IN NUMBER,
        p_month IN DATE,
        p_report OUT SYS_REFCURSOR
    ) IS
    BEGIN
        OPEN p_report FOR
            SELECT
                c.category_name,
                SUM(t.amount) AS total_spent,
                b.budget_limit,
                b.budget_limit - SUM(t.amount) AS remaining_budget
            FROM transaction_entry t
            JOIN category c
                ON c.category_id = t.category_id
            LEFT JOIN budget b
                ON b.user_id = t.user_id
               AND b.category_id = t.category_id
               AND b.budget_month_key = TRUNC(p_month, 'MM')
            WHERE t.user_id = p_user_id
              AND t.transaction_type = 'EXPENSE'
              AND TRUNC(t.transaction_date, 'MM') = TRUNC(p_month, 'MM')
            GROUP BY c.category_name, b.budget_limit
            ORDER BY total_spent DESC;
    END pr_monthly_report;
END finance_tracker_pkg;
/

CREATE OR REPLACE TRIGGER trg_transaction_budget_guard
BEFORE INSERT OR UPDATE ON transaction_entry
FOR EACH ROW
DECLARE
    v_category_type category.category_type%TYPE;
    v_budget_limit budget.budget_limit%TYPE;
    v_month_spent NUMBER(12,2);
BEGIN
    SELECT category_type
    INTO v_category_type
    FROM category
    WHERE category_id = :NEW.category_id;

    IF v_category_type <> :NEW.transaction_type THEN
        RAISE_APPLICATION_ERROR(-20001, 'Transaction type must match category type.');
    END IF;

    IF :NEW.transaction_type = 'EXPENSE' THEN
        BEGIN
            SELECT budget_limit
            INTO v_budget_limit
            FROM budget
            WHERE user_id = :NEW.user_id
              AND category_id = :NEW.category_id
              AND budget_month_key = TRUNC(:NEW.transaction_date, 'MM');
        EXCEPTION
            WHEN NO_DATA_FOUND THEN
                v_budget_limit := NULL;
        END;

        IF v_budget_limit IS NOT NULL THEN
            SELECT NVL(SUM(amount), 0)
            INTO v_month_spent
            FROM transaction_entry
            WHERE user_id = :NEW.user_id
              AND category_id = :NEW.category_id
              AND transaction_type = 'EXPENSE'
              AND TRUNC(transaction_date, 'MM') = TRUNC(:NEW.transaction_date, 'MM')
              AND transaction_id <> NVL(:NEW.transaction_id, -1);

            IF v_month_spent + :NEW.amount > v_budget_limit THEN
                RAISE_APPLICATION_ERROR(-20002, 'Monthly budget limit exceeded for selected category.');
            END IF;
        END IF;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_transaction_account_balance
AFTER INSERT OR UPDATE OR DELETE ON transaction_entry
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        UPDATE account
        SET current_balance = current_balance +
            CASE
                WHEN :NEW.transaction_type = 'INCOME' THEN :NEW.amount
                ELSE -:NEW.amount
            END
        WHERE account_id = :NEW.account_id;

    ELSIF UPDATING THEN
        UPDATE account
        SET current_balance = current_balance -
            CASE
                WHEN :OLD.transaction_type = 'INCOME' THEN :OLD.amount
                ELSE -:OLD.amount
            END
        WHERE account_id = :OLD.account_id;

        UPDATE account
        SET current_balance = current_balance +
            CASE
                WHEN :NEW.transaction_type = 'INCOME' THEN :NEW.amount
                ELSE -:NEW.amount
            END
        WHERE account_id = :NEW.account_id;

    ELSIF DELETING THEN
        UPDATE account
        SET current_balance = current_balance -
            CASE
                WHEN :OLD.transaction_type = 'INCOME' THEN :OLD.amount
                ELSE -:OLD.amount
            END
        WHERE account_id = :OLD.account_id;
    END IF;
END;
/

CREATE OR REPLACE TRIGGER trg_goal_contribution_rollup
AFTER INSERT OR UPDATE OR DELETE ON goal_contribution
FOR EACH ROW
BEGIN
    IF INSERTING THEN
        UPDATE savings_goal
        SET current_amount = current_amount + :NEW.contribution_amount
        WHERE goal_id = :NEW.goal_id;
    ELSIF UPDATING THEN
        UPDATE savings_goal
        SET current_amount = current_amount - :OLD.contribution_amount + :NEW.contribution_amount
        WHERE goal_id = :NEW.goal_id;
    ELSIF DELETING THEN
        UPDATE savings_goal
        SET current_amount = current_amount - :OLD.contribution_amount
        WHERE goal_id = :OLD.goal_id;
    END IF;

    UPDATE savings_goal
    SET status = CASE
        WHEN current_amount >= target_amount THEN 'ACHIEVED'
        ELSE status
    END
    WHERE goal_id = NVL(:NEW.goal_id, :OLD.goal_id);
END;
/
