-- Allow customers to insert their own transactions (website checkout)
CREATE POLICY "customer_insert_own_transactions"
ON public.transactions
FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND customer_user_id = auth.uid()
);

-- Allow customers to read their own transactions
CREATE POLICY "customer_read_own_transactions"
ON public.transactions
FOR SELECT
USING (customer_user_id = auth.uid());

-- Allow customers to insert transaction items for their own transactions
CREATE POLICY "customer_insert_own_transaction_items"
ON public.transaction_items
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = transaction_items.transaction_id
    AND t.customer_user_id = auth.uid()
  )
);

-- Allow customers to read their own transaction items
CREATE POLICY "customer_read_own_transaction_items"
ON public.transaction_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM transactions t
    WHERE t.id = transaction_items.transaction_id
    AND t.customer_user_id = auth.uid()
  )
);