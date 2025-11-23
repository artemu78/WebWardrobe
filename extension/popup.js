const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');

  // Check Auth
  chrome.identity.getAuthToken({ interactive: false }, function(token) {
    if (token) {
      showMain(token);
    }
  });

  loginBtn.addEventListener('click', () => {
    chrome.identity.getAuthToken({ interactive: true }, function(token) {
      if (chrome.runtime.lastError) {
        console.error(chrome.runtime.lastError);
        return;
      }
      showMain(token);
    });
  });

  function showMain(token) {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    loadImages(token);

    // Setup Upload
    uploadBtn.onclick = async () => {
      const nameInput = document.getElementById('image-name');
      const fileInput = document.getElementById('image-file');
      const statusMsg = document.getElementById('status-msg');
      
      const name = nameInput.value;
      const file = fileInput.files[0];

      if (!name || !file) {
        statusMsg.textContent = "Please select a file and name it.";
        return;
      }

      statusMsg.textContent = "Getting upload URL...";
      uploadBtn.disabled = true;

      try {
        // 1. Get Presigned URL
        const res1 = await fetch(`${API_BASE_URL}/user/images/upload-url`, {
          method: 'POST',
          headers: { 'Authorization': token, 'Content-Type': 'application/json' }, // Send token in Auth header
          body: JSON.stringify({ filename: file.name, contentType: file.type })
        });
        const data1 = await res1.json();
        
        if (!res1.ok) throw new Error(data1.error || 'Failed to get upload URL');

        // 2. Upload to S3
        statusMsg.textContent = "Uploading image...";
        await fetch(data1.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type }
        });

        // 3. Confirm
        statusMsg.textContent = "Saving profile...";
        const res3 = await fetch(`${API_BASE_URL}/user/images`, {
          method: 'POST',
          headers: { 'Authorization': token, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            s3Key: data1.s3Key,
            fileId: data1.fileId
          })
        });
        
        if (!res3.ok) {
            const err = await res3.json();
            throw new Error(err.error || 'Failed to save profile');
        }

        statusMsg.textContent = "Upload complete!";
        nameInput.value = '';
        fileInput.value = '';
        loadImages(token);
        
        // Refresh context menu
        chrome.runtime.sendMessage({ action: "refreshContextMenu" });

      } catch (e) {
        console.error(e);
        statusMsg.textContent = "Error: " + e.message;
      } finally {
        uploadBtn.disabled = false;
      }
    };
  }

  async function loadImages(token) {
    const listDiv = document.getElementById('image-list');
    listDiv.innerHTML = 'Loading...';
    
    try {
      const res = await fetch(`${API_BASE_URL}/user/images`, {
        headers: { 'Authorization': token } // Send token in Auth header
      });
      const data = await res.json();
      
      listDiv.innerHTML = '';
      if (data.images && data.images.length > 0) {
        data.images.forEach(img => {
          const div = document.createElement('div');
          div.className = 'image-item';
          div.innerHTML = `
            <img src="${img.s3Url}" alt="${img.name}">
            <span>${img.name}</span>
          `;
          listDiv.appendChild(div);
        });
      } else {
        listDiv.textContent = "No images yet.";
      }
    } catch (e) {
      listDiv.textContent = "Failed to load images.";
    }
  }
});
