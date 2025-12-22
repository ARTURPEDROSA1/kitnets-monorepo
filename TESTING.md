
# Testing Instructions

To verify the "Claim Gateway" flow, you need to simulate a factory-created gateway in your database.

1. **Go to Supabase SQL Editor**.
2. **Run this SQL** to insert a test gateway:

    ```sql
    INSERT INTO public.gateways (serial_number, status, label)
    VALUES ('GW-TEST-001', 'unclaimed', 'Test Gateway Device');
    ```

3. **Go to the Sign Up Page**: `http://localhost:3000/pt/signup/proprietario`
4. **Fill out the form**:
    * Name: Your Name
    * Email: (Use a real email to verify with Clerk)
    * Password: ...
    * **Gateway Code**: `GW-TEST-001`
5. **Submit**:
    * You should be redirected to `/dashboard`.
    * You should see "Test Gateway Device" listed in your dashboard.

## Next Steps

- The dashboard currently shows data from the DB.
* To show **Live Data**, we will need to connect the frontend to the MQTT broker using WebSockets.
