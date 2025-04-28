const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function createProfilesTable() {
  try {
    // Create profiles table
    const { error } = await supabase.rpc('create_profiles_table', {
      table_name: 'profiles'
    })

    if (error) {
      console.error('Error creating profiles table:', error)
      return
    }

    // Add RLS policies
    const { error: policyError } = await supabase.rpc('create_profiles_policies', {
      table_name: 'profiles'
    })

    if (policyError) {
      console.error('Error creating profiles policies:', policyError)
      return
    }

    console.log('Profiles table and policies created successfully')
  } catch (error) {
    console.error('Error in migration:', error)
  }
}

// Create the profiles table function in Supabase
async function createProfilesTableFunction() {
  const { error } = await supabase.rpc('create_profiles_table_function', {
    function_name: 'create_profiles_table'
  })

  if (error) {
    console.error('Error creating profiles table function:', error)
    return
  }

  console.log('Profiles table function created successfully')
}

// Create the profiles policies function in Supabase
async function createProfilesPoliciesFunction() {
  const { error } = await supabase.rpc('create_profiles_policies_function', {
    function_name: 'create_profiles_policies'
  })

  if (error) {
    console.error('Error creating profiles policies function:', error)
    return
  }

  console.log('Profiles policies function created successfully')
}

// Run the migration
async function runMigration() {
  await createProfilesTableFunction()
  await createProfilesPoliciesFunction()
  await createProfilesTable()
}

runMigration() 