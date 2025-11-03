pipeline {
    agent any

    stages {
        stage('Checkout') {
            steps {
                echo '📦 Checking out latest code...'
                git branch: 'main', url: 'https://github.com/chandramohan05/online-voting-system-nodejs.git'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo '📦 Installing npm dependencies...'
                bat 'npm install'
            }
        }

        stage('Run Tests') {
            steps {
                echo '🧪 Running basic checks...'
                bat 'echo Running test phase (add npm test here if available)'
            }
        }

        stage('Deploy / Restart Server') {
            steps {
                echo '🚀 Restarting Node.js server...'
                bat 'taskkill /IM node.exe /F || echo No Node process running'
                bat 'start /B node server.js'
            }
        }
    }

    post {
        success {
            echo '✅ Build and deployment completed successfully!'
        }
        failure {
            echo '❌ Build failed. Please check the console output for details.'
        }
    }
}
