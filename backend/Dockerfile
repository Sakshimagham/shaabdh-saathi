# Use Python 3.12 (stable, has pre-built wheels for all packages)
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# Copy requirements first (for better caching)
COPY requirements.txt .

# Install dependencies
RUN pip install --no-cache-dir -r requirements.txt

# Copy the rest of the backend code
COPY . .

# Expose the port Render expects (default 10000)
EXPOSE 10000

# Start the server
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "10000"]
