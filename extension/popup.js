const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');

  const topupBtn = document.getElementById('topup-btn');
  const creditCount = document.getElementById('credit-count');

  const logoutBtn = document.getElementById('logout-btn');

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

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      chrome.identity.getAuthToken({ interactive: false }, function(token) {
        if (token) {
          chrome.identity.removeCachedAuthToken({ token: token }, function() {
            showLogin();
          });
        } else {
          showLogin();
        }
      });
    });
  }

  function showLogin() {
    authSection.classList.remove('hidden');
    mainSection.classList.add('hidden');
    document.getElementById('image-list').innerHTML = '';
  }

  // Modal Logic
  const modal = document.getElementById("image-modal");
  const modalImg = document.getElementById("modal-img");
  const span = document.getElementsByClassName("close")[0];

  span.onclick = function() { 
    modal.style.display = "none";
  }
  
  window.onclick = function(event) {
    if (event.target == modal) {
      modal.style.display = "none";
    }
  }

  /**
   * Display the main UI, hide the authentication UI, load the user's images, and attach top-up and upload handlers.
   * @param {string} token - OAuth bearer token used for authenticated API requests.
   */
  function showMain(token) {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    loadImages(token);

    // Setup TopUp
    if (topupBtn) {
        topupBtn.onclick = () => {
             alert("Top-up functionality coming soon!");
        };
    }

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

      statusMsg.textContent = "Processing image...";
      uploadBtn.disabled = true;

      try {
        // 0. Generate Thumbnail
        const thumbnailBlob = await resizeImage(file, 48, 48);

        // 1. Get Presigned URLs (Original + Thumbnail)
        statusMsg.textContent = "Getting upload URLs...";
        const res1 = await fetch(`${API_BASE_URL}/user/images/upload-url`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
              filename: file.name, 
              contentType: file.type,
              includeThumbnail: true 
          })
        });
        
        if (res1.status === 401) {
            throw new Error("Unauthorized. Please sign out and sign in again.");
        }

        const data1 = await res1.json();
        if (!res1.ok) throw new Error(data1.error || 'Failed to get upload URL');

        // 2. Upload to S3 (Original)
        statusMsg.textContent = "Uploading original...";
        await fetch(data1.uploadUrl, {
          method: 'PUT',
          body: file,
          headers: { 'Content-Type': file.type }
        });

        // 3. Upload to S3 (Thumbnail)
        statusMsg.textContent = "Uploading thumbnail...";
        await fetch(data1.thumbnailUploadUrl, {
            method: 'PUT',
            body: thumbnailBlob,
            headers: { 'Content-Type': file.type }
        });

        // 4. Confirm
        statusMsg.textContent = "Saving profile...";
        const res3 = await fetch(`${API_BASE_URL}/user/images`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: name,
            s3Key: data1.s3Key,
            fileId: data1.fileId,
            thumbnailS3Key: data1.thumbnailS3Key
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

  /**
   * Load and render the current user's images into the image list and update the displayed credit count.
   *
   * Displays a loading placeholder, fetches the user's images and credit information from the API using the provided bearer token, and populates the DOM image list with thumbnail/display images, download links, and delete controls. Updates the credit-count text and sets its color to red when credits are less than or equal to zero. Shows a session-expired message for unauthorized responses and a failure message on fetch errors.
   *
   * @param {string} token - Bearer token used to authenticate requests to the images API.
   */
  async function loadImages(token) {
    const listDiv = document.getElementById('image-list');
    listDiv.innerHTML = 'Loading...';
    
    try {
      const res = await fetch(`${API_BASE_URL}/user/images`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (res.status === 401) {
          listDiv.innerHTML = '<span style="color:red">Session expired. Please Sign Out.</span>';
          return;
      }

      const data = await res.json();
      
      if (data.credits !== undefined) {
          creditCount.textContent = data.credits;
          if (data.credits <= 0) {
              creditCount.style.color = 'red';
          } else {
              creditCount.style.color = 'black';
          }
      }

      listDiv.innerHTML = '';
      if (data.images && data.images.length > 0) {
        data.images.forEach(img => {
          const div = document.createElement('div');
          div.className = 'image-item';
          
          // Use thumbnail if available, else original
          const displayUrl = img.thumbnailUrl || img.s3Url;
          
          div.innerHTML = `
            <div class="image-info" title="Click to view original">
                <img src="${displayUrl}" alt="${img.name}">
                <span>${img.name}</span>
            </div>
            <div class="image-actions">
                <a href="${img.s3Url}" download="${img.name}" target="_blank" class="action-btn" title="Download">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                </a>
                <button class="action-btn rename-btn" data-id="${img.id}" title="Rename">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                    </svg>
                </button>
                <button class="action-btn delete-btn" data-id="${img.id}" title="Delete">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="3 6 5 6 21 6"></polyline>
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                    </svg>
                </button>
            </div>
          `;
          
          // Click to view original
          div.querySelector('.image-info').onclick = () => {
              modal.style.display = "block";
              modalImg.src = img.s3Url;
          };

          // Rename action
          div.querySelector('.rename-btn').onclick = async (e) => {
              e.stopPropagation();
              const newName = prompt("Enter new name:", img.name);
              if (newName && newName !== img.name) {
                  await renameImage(img.id, newName, token);
              }
          };

          // Delete action
          div.querySelector('.delete-btn').onclick = async (e) => {
              e.stopPropagation();
              if (confirm(`Delete "${img.name}"?`)) {
                  await deleteImage(img.id, token);
              }
          };

          listDiv.appendChild(div);
        });
      } else {
        listDiv.textContent = "No images yet.";
      }
    } catch (e) {
      listDiv.textContent = "Failed to load images.";
    }
  }

  async function renameImage(fileId, newName, token) {
      try {
          const res = await fetch(`${API_BASE_URL}/user/images/${fileId}`, {
              method: 'PATCH',
              headers: { 
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json'
              },
              body: JSON.stringify({ name: newName })
          });
          
          if (!res.ok) {
              const err = await res.text();
              throw new Error(`Failed to rename (${res.status}): ${err}`);
          }
          
          loadImages(token); // Reload list
          
      } catch (e) {
          alert("Error renaming image: " + e.message);
      }
  }

  async function deleteImage(fileId, token) {
      const listDiv = document.getElementById('image-list');
      try {
          const res = await fetch(`${API_BASE_URL}/user/images/${fileId}`, {
              method: 'DELETE',
              headers: { 'Authorization': `Bearer ${token}` }
          });
          
          if (!res.ok) throw new Error("Failed to delete");
          
          loadImages(token); // Reload list
          chrome.runtime.sendMessage({ action: "refreshContextMenu" });
          
      } catch (e) {
          alert("Error deleting image: " + e.message);
      }
  }

  function resizeImage(file, maxWidth, maxHeight) {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        const reader = new FileReader();
        
        reader.onload = function(e) {
            img.src = e.target.result;
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                // Calculate aspect ratio
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    resolve(blob);
                }, file.type);
            };
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
  }
});