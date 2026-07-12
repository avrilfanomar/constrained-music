# Constrained Music Studio - Production Docker Image
# Bundles Picat + FluidSynth + FFmpeg + Python dependencies + web app

FROM ubuntu:22.04

# Prevent interactive prompts during apt install
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    # Picat runtime
    wget \
    # Python
    python3 \
    python3-pip \
    # Audio rendering
    fluidsynth \
    fluid-soundfont-gm \
    ffmpeg \
    # Utilities
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install Picat 3.9
WORKDIR /opt
RUN wget http://picat-lang.org/download/picat39_linux64.tar.gz && \
    tar -xzf picat39_linux64.tar.gz && \
    rm picat39_linux64.tar.gz && \
    ln -s /opt/Picat/picat /usr/local/bin/picat

# Set up application directory
WORKDIR /app

# Copy Python requirements and install
COPY pyproject.toml ./
RUN pip3 install --no-cache-dir .

# Copy application files
COPY picat/ ./picat/
COPY scripts/ ./scripts/
COPY web/ ./web/
COPY data/ ./data/
COPY LICENSE README.md CLAUDE.md ./

# Make scripts executable
RUN chmod +x scripts/*.sh

# Set environment variables
ENV PICATPATH=/app/picat
ENV CMS_SOUNDFONT=/usr/share/sounds/sf2/FluidR3_GM.sf2
ENV PYTHONUNBUFFERED=1

# Create output directory for generated files
RUN mkdir -p /app/output /app/library

# Expose web server port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/config || exit 1

# Run the web server
CMD ["python3", "-m", "uvicorn", "web.server:app", "--host", "0.0.0.0", "--port", "8000"]
