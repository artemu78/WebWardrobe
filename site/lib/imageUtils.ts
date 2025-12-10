export const resizeImage = (file: File, maxWidth: number, maxHeight: number): Promise<Blob> => {
    return new Promise((resolve, reject) => {
        const img = document.createElement('img');
        const reader = new FileReader();

        reader.onload = function (e) {
            img.src = e.target?.result as string;
            img.onload = function () {
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
                if (ctx) {
                    ctx.drawImage(img, 0, 0, width, height);
                    canvas.toBlob((blob) => {
                        if (blob) {
                            resolve(blob);
                        } else {
                            reject(new Error('Canvas to Blob failed'));
                        }
                    }, file.type);
                } else {
                    reject(new Error('Could not get canvas context'));
                }
            };
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
};
