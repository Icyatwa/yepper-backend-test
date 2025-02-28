// public/ads-distribution.js
(async () => {
  try {
    const response = await fetch('https://yepper-backend.onrender.com/api/ads/random');
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const ad = await response.json();
    console.log('Fetched Ad:', ad); // Log the fetched ad to check if it's correct

    if (ad && ad.imageUrl) {
      const adContainer = document.createElement('div');
      adContainer.style.position = 'fixed';
      adContainer.style.bottom = '10px';
      adContainer.style.right = '10px';
      adContainer.innerHTML = `
        <a href="${ad.trackingUrl}" target="_blank">
          <img src="${ad.imageUrl}" alt="Ad" style="width: 300px; height: 300px;"/>
        </a>
      `;
      document.body.appendChild(adContainer);
    } else if (ad && ad.pdfUrl) {
      const adContainer = document.createElement('div');
      adContainer.style.position = 'fixed';
      adContainer.style.bottom = '10px';
      adContainer.style.right = '10px';
      adContainer.innerHTML = `
        <a href="${ad.trackingUrl}" target="_blank">
          <embed src="${ad.pdfUrl}" type="application/pdf" width="300" height="300">
        </a>
      `;
      document.body.appendChild(adContainer);
    } else if (ad && ad.videoUrl) {
      const adContainer = document.createElement('div');
      adContainer.style.position = 'fixed';
      adContainer.style.bottom = '10px';
      adContainer.style.right = '10px';
      adContainer.innerHTML = `
        <a href="${ad.trackingUrl}" target="_blank">
          <video width="300" height="300" controls>
            <source src="${ad.videoUrl}" type="video/mp4">
            Your browser does not support the video tag.
          </video>
        </a>
      `;
      document.body.appendChild(adContainer);
    } else {
      console.error('No valid ad found to display');
    }
  } catch (error) {
    console.error('Error fetching and displaying the ad:', error);
  }
})();
