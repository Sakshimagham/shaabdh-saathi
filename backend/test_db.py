import os
from dotenv import load_dotenv
from pathlib import Path
from pymongo import MongoClient
import ssl

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

mongo_url = os.environ.get('MONGO_URL')
db_name = os.environ.get('DB_NAME', 'shaabdh_saathi')

print("🔗 Testing MongoDB connection...")
print(f"📡 Database: {db_name}")

try:
    # Try with SSL disabled for testing (only if you have VPN/local)
    client = MongoClient(
        mongo_url,
        tlsAllowInvalidCertificates=True,  # This bypasses SSL issues
        serverSelectionTimeoutMS=5000
    )
    
    client.admin.command('ping')
    print("✅ Connection successful!")
    
    db = client[db_name]
    print(f"✅ Database '{db_name}' is ready")
    
    # Create collections
    collections = ['users', 'progress', 'status_checks']
    for coll in collections:
        if coll not in db.list_collection_names():
            db.create_collection(coll)
            print(f"✅ Created collection: {coll}")
    
    print("✅ All good! Database is ready to use.")
    client.close()
    
except Exception as e:
    print(f"❌ Error: {e}")
    print("\n📌 Troubleshooting tips:")
    print("1. Update pip: python -m pip install --upgrade pip")
    print("2. Update pymongo: pip install --upgrade pymongo")
    print("3. Check MongoDB Atlas connection string")