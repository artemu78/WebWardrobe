const API_BASE_URL = "https://nw2ghqgbe5.execute-api.us-east-1.amazonaws.com/prod";

document.addEventListener('DOMContentLoaded', () => {
  const loginBtn = document.getElementById('login-btn');
  const uploadBtn = document.getElementById('upload-btn');
  const authSection = document.getElementById('auth-section');
  const mainSection = document.getElementById('main-section');

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

  function showMain(token) {
    authSection.classList.add('hidden');
    mainSection.classList.remove('hidden');
    loadImages(token);

    // Setup Upload
    uploadBtn.onclick = async () => {
      const nameInput = document.getElementById('image-name');
      const fileInput = document.getElementById('file-upload');
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

  // Drag and drop
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('file-upload');
  const dropZoneText = document.getElementById('drop-zone-text');

  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dropZone.classList.add('bg-slate-100', 'dark:bg-slate-700');
  });

  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  dropZone.addEventListener('dragleave', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-slate-100', 'dark:bg-slate-700');
  });

  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('bg-slate-100', 'dark:bg-slate-700');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      fileInput.files = files;
      updateDropZoneText(files[0].name);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length > 0) {
      updateDropZoneText(fileInput.files[0].name);
    }
  });

  function updateDropZoneText(fileName) {
      dropZoneText.innerHTML = `
          <span class="material-icons-outlined text-4xl text-green-500 mb-2">check_circle</span>
          <p class="mb-1 text-sm text-slate-500 dark:text-slate-400"><span class="font-semibold">${fileName}</span></p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Ready to upload</p>
      `;
  }

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
      
      listDiv.innerHTML = '';
      if (data.images && data.images.length > 0) {
        data.images.forEach(img => {
          const div = document.createElement('div');
          div.className = 'flex items-center p-3 border border-slate-200 dark:border-slate-700 rounded-lg';
          
          const displayUrl = img.thumbnailUrl || img.s3Url;
          
          div.innerHTML = `
            <img alt="${img.name}" class="w-12 h-12 object-cover rounded-md mr-4" src="${displayUrl}"/>
            <span class="flex-grow font-medium text-slate-800 dark:text-slate-200">${img.name}</span>
            <div class="flex items-center space-x-3 text-slate-500 dark:text-slate-400">
                <a href="${img.s3Url}" download="${img.name}" target="_blank" class="hover:text-primary" title="Download">
                    <span class="material-icons-outlined" style="font-size: 20px;">download</span>
                </a>
                <button class="hover:text-primary rename-btn" data-id="${img.id}" title="Rename">
                    <span class="material-icons-outlined" style="font-size: 20px;">edit</span>
                </button>
                <button class="hover:text-red-500 delete-btn" data-id="${img.id}" title="Delete">
                    <span class="material-icons-outlined" style="font-size: 20px;">delete</span>
                </button>
            </div>
          `;
          
          div.querySelector('img').onclick = () => {
              modal.style.display = "block";
              modalImg.src = img.s3Url;
          };
          div.querySelector('span').onclick = () => {
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
