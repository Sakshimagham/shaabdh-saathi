"""
Test script to find which Gemini models are available and working.
Tests ALL available models and shows responses with token usage.
"""

import asyncio
import json
import os
import time
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Check if Gemini API key is available
gemini_api_key = os.environ.get("GEMINI_API_KEY")
if not gemini_api_key:
    print("❌ GEMINI_API_KEY not found in .env file!")
    print("Please add GEMINI_API_KEY=your_api_key to your .env file")
    exit(1)

print(f"✅ Found GEMINI_API_KEY: {gemini_api_key[:10]}...")

# Test with a real question
TEST_QUESTION = "What is the capital of France? Answer in one sentence."

async def test_gemini_model(model_name: str, api_key: str):
    """
    Test a single Gemini model with a real question.
    Returns (model_name, success, response_text, token_usage, elapsed_time, error_message)
    """
    from google import genai
    from google.genai import types
    
    start_time = time.time()
    
    try:
        # Initialize client
        client = genai.Client(api_key=api_key)
        
        # Test the model with a real question
        response = client.models.generate_content(
            model=model_name,
            contents=TEST_QUESTION,
            config=types.GenerateContentConfig(
                temperature=0.7,
                max_output_tokens=100,
            )
        )
        
        elapsed = time.time() - start_time
        
        # Get token usage if available
        token_usage = "N/A"
        if hasattr(response, 'usage_metadata'):
            usage = response.usage_metadata
            token_usage = {
                "prompt_tokens": getattr(usage, 'prompt_token_count', 'N/A'),
                "candidates_tokens": getattr(usage, 'candidates_token_count', 'N/A'),
                "total_tokens": getattr(usage, 'total_token_count', 'N/A')
            }
        
        return (model_name, True, response.text, token_usage, elapsed, None)
            
    except Exception as e:
        elapsed = time.time() - start_time
        error_msg = str(e)
        
        # Categorize errors
        if "404" in error_msg or "not found" in error_msg.lower():
            return (model_name, False, None, None, elapsed, "Model not found")
        elif "403" in error_msg or "permission" in error_msg.lower():
            return (model_name, False, None, None, elapsed, "Permission denied")
        elif "429" in error_msg or "quota" in error_msg.lower():
            return (model_name, False, None, None, elapsed, "Quota exceeded")
        elif "400" in error_msg and "response modality" in error_msg.lower():
            return (model_name, False, None, None, elapsed, "Invalid response modality")
        elif "no longer" in error_msg.lower():
            return (model_name, False, None, None, elapsed, "Model deprecated")
        else:
            # Truncate error message
            error_short = error_msg[:100] + "..." if len(error_msg) > 100 else error_msg
            return (model_name, False, None, None, elapsed, error_short)

async def list_available_models(api_key: str):
    """List all available models from the API"""
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        
        # Try to list models
        models = client.models.list()
        available_models = []
        for model in models:
            if "gemini" in model.name.lower():
                available_models.append(model.name)
        
        return available_models
    except Exception as e:
        print(f"⚠️ Could not list models: {e}")
        return []

async def main():
    """Test all Gemini models and show responses"""
    print("\n" + "="*80)
    print("🔍 Testing ALL Gemini Models with Real Questions")
    print("="*80)
    
    # Get all available models
    print("\n📋 Fetching all available Gemini models...")
    available_models = await list_available_models(gemini_api_key)
    
    if not available_models:
        print("❌ No models found! Check your API key.")
        return
    
    print(f"✅ Found {len(available_models)} Gemini models:")
    for i, model in enumerate(available_models, 1):
        print(f"   {i:2}. {model}")
    print()
    
    print(f"📝 Test Question: {TEST_QUESTION}\n")
    print("="*80)
    print("🔄 Testing Models...")
    print("="*80 + "\n")
    
    results = []
    working_models = []
    failed_models = []
    
    for i, model_name in enumerate(available_models, 1):
        display_name = model_name.replace("models/", "")
        print(f"[{i:2}/{len(available_models)}] Testing: {display_name}... ", end="", flush=True)
        
        # Test the model
        model_name_result, success, response_text, token_usage, elapsed, error = await test_gemini_model(
            model_name, gemini_api_key
        )
        
        if success:
            print(f"✅ Working ({elapsed:.2f}s)")
            working_models.append(model_name)
            
            # Show token usage
            if token_usage and token_usage != "N/A":
                print(f"     📊 Tokens: {token_usage['total_tokens']} (Prompt: {token_usage['prompt_tokens']}, Response: {token_usage['candidates_tokens']})")
            
            # Show response (truncated if too long)
            if response_text:
                response_short = response_text[:150] + "..." if len(response_text) > 150 else response_text
                print(f"     💬 {response_short}")
            print()
            
        else:
            print(f"❌ Failed ({elapsed:.2f}s) - {error}")
            failed_models.append({"model": model_name, "error": error})
            print()
        
        results.append({
            "model": model_name,
            "display_name": display_name,
            "success": success,
            "response": response_text if success else None,
            "token_usage": token_usage if success else None,
            "elapsed": elapsed,
            "error": error if not success else None
        })
        
        # Small delay to avoid rate limits
        await asyncio.sleep(0.3)
    
    # Summary
    print("="*80)
    print("📊 Summary")
    print("="*80)
    
    print(f"\n✅ Working Models ({len(working_models)}):")
    if working_models:
        for model in working_models:
            print(f"  • {model}")
    else:
        print("  ❌ No working models found!")
    
    print(f"\n❌ Failed Models ({len(failed_models)}):")
    if failed_models:
        # Group by error type
        error_groups = {}
        for item in failed_models:
            error = item["error"]
            if error not in error_groups:
                error_groups[error] = []
            error_groups[error].append(item["model"])
        
        for error, models in error_groups.items():
            print(f"  • {error} ({len(models)} models):")
            for model in models[:5]:  # Show first 5
                print(f"    - {model}")
            if len(models) > 5:
                print(f"    ... and {len(models) - 5} more")
    else:
        print("  No failed models!")
    
    # Detailed responses from working models
    if working_models:
        print("\n" + "="*80)
        print("📝 Detailed Responses from Working Models")
        print("="*80)
        
        for r in results:
            if r["success"]:
                print(f"\n🔹 {r['display_name']} ({r['elapsed']:.2f}s):")
                print(f"   Response: {r['response']}")
                if r['token_usage'] and r['token_usage'] != "N/A":
                    print(f"   Tokens: {json.dumps(r['token_usage'], indent=2)}")
        
        # Performance comparison
        print("\n" + "="*80)
        print("⚡ Performance Comparison (Fastest to Slowest)")
        print("="*80)
        
        sorted_results = sorted([r for r in results if r["success"]], key=lambda x: x["elapsed"])
        for i, r in enumerate(sorted_results, 1):
            print(f"  {i:2}. {r['display_name']}: {r['elapsed']:.2f}s")
    
    # Save detailed results to JSON
    output_data = {
        "test_question": TEST_QUESTION,
        "total_models_tested": len(available_models),
        "working_models": working_models,
        "working_count": len(working_models),
        "failed_count": len(failed_models),
        "all_results": results,
        "available_models": available_models,
        "timestamp": time.time(),
        "timestamp_readable": time.strftime("%Y-%m-%d %H:%M:%S")
    }
    
    with open("gemini_test_results.json", "w") as f:
        json.dump(output_data, f, indent=2)
    
    # Also save a summary text file
    with open("gemini_test_summary.txt", "w") as f:
        f.write("="*80 + "\n")
        f.write("GEMINI MODELS TEST SUMMARY\n")
        f.write("="*80 + "\n\n")
        f.write(f"Test Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n")
        f.write(f"Test Question: {TEST_QUESTION}\n\n")
        f.write(f"Total Models Tested: {len(available_models)}\n")
        f.write(f"✅ Working Models: {len(working_models)}\n")
        f.write(f"❌ Failed Models: {len(failed_models)}\n\n")
        
        if working_models:
            f.write("WORKING MODELS:\n")
            f.write("-"*40 + "\n")
            for model in working_models:
                f.write(f"  ✅ {model}\n")
            
            f.write("\nPERFORMANCE (Fastest to Slowest):\n")
            f.write("-"*40 + "\n")
            sorted_results = sorted([r for r in results if r["success"]], key=lambda x: x["elapsed"])
            for i, r in enumerate(sorted_results, 1):
                f.write(f"  {i:2}. {r['display_name']}: {r['elapsed']:.2f}s\n")
        
        if failed_models:
            f.write("\nFAILED MODELS:\n")
            f.write("-"*40 + "\n")
            for item in failed_models:
                f.write(f"  ❌ {item['model']}: {item['error']}\n")
    
    print("\n" + "="*80)
    print("✅ Results saved to:")
    print("   • gemini_test_results.json (detailed JSON)")
    print("   • gemini_test_summary.txt (readable summary)")
    print("="*80 + "\n")

if __name__ == "__main__":
    asyncio.run(main())