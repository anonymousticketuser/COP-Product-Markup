// Global orders array - generated once and reused
let globalOrders = null;
// Track selected bars for custom date range selection
let selectedBars = [];
// Chart rendering optimization
let chartAnimationFrame = null;
let lastChartUpdate = 0;
const CHART_UPDATE_THROTTLE = 100; // ms
// Global variable to store current advance amount for chart display
let currentAdvanceAmount = 0;

// Pagination variables
let currentPage = 1;
const ORDERS_PER_PAGE = 100;
let totalOrders = 0;
let currentOrders = [];

// Page Navigation Function
function showPage(pageId) {
    console.log('Navigating to page:', pageId);
    
    // Hide all pages - only target top-level pages
    const pages = document.querySelectorAll('#page-container > .page');
    pages.forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    // Show target page
    const targetPage = document.getElementById(pageId);
    if (targetPage) {
        targetPage.classList.add('active');
        
        console.log('Successfully navigated to:', pageId);
        
        // Debug: Check what CSS is actually being applied
        setTimeout(() => {
            const computedStyle = window.getComputedStyle(targetPage);
            console.log('Target page computed styles after navigation:', {
                display: computedStyle.display,
                visibility: computedStyle.visibility,
                opacity: computedStyle.opacity,
                classes: targetPage.className,
                inlineStyles: targetPage.getAttribute('style')
            });
            
            // Also check if the page is actually visible in the DOM
            const rect = targetPage.getBoundingClientRect();
            console.log('Target page bounding rect:', rect);
            console.log('Target page is in viewport:', rect.top >= 0 && rect.left >= 0 && rect.bottom <= window.innerHeight && rect.right <= window.innerWidth);
            
            // Check if any parent elements are hidden
            let parent = targetPage.parentElement;
            let level = 0;
            while (parent && level < 5) {
                const parentStyle = window.getComputedStyle(parent);
                console.log(`Parent level ${level} (${parent.tagName}):`, {
                    id: parent.id,
                    classes: parent.className,
                    display: parentStyle.display,
                    visibility: parentStyle.visibility,
                    opacity: parentStyle.opacity
                });
                parent = parent.parentElement;
                level++;
            }
        }, 100);
        
                console.log('Successfully navigated to:', pageId);
        
        // Debug: Check page content after navigation
        setTimeout(() => {
            const targetPage = document.getElementById(pageId);
            if (targetPage) {
                console.log(`Page ${pageId} content:`, {
                    innerHTML: targetPage.innerHTML.substring(0, 200) + '...',
                    children: targetPage.children.length,
                    firstChild: targetPage.firstElementChild?.tagName,
                    rect: targetPage.getBoundingClientRect()
                });
            }
        }, 100);
        
        // Scroll to top of page
        window.scrollTo(0, 0);
        
        // Initialize slider if on forecast page
        if (pageId === 'forecast-page') {
            initializeAdvanceSlider();
        }
        
        // Populate offer page if on offer page
        if (pageId === 'offer-page') {
            populateOfferPage();
        }
        
        // Populate terms page if on terms page
        if (pageId === 'terms-page') {
            populateTermsPage();
        }
        } else {
            console.error('Page not found:', pageId);
        }
}

// Initialize Advance Slider
function initializeAdvanceSlider() {
    console.log('Initializing advance calculation');
    const dateRangeSlider = document.getElementById('date-range-slider');
    
    if (dateRangeSlider) {
        // Initialize Ion Range Slider with default values
        // Will be updated after CSV loads with actual date range
        $(dateRangeSlider).ionRangeSlider({
            type: 'double',
            min: 0,
            max: 100,
            from: 0,
            to: 30,
            step: 1,
            grid: false,
            hide_min_max: true,
            hide_from_to: true,
            prettify: false,
            onChange: function(data) {
                updateDateRangeLabel(data);
                resetMilestoneCelebrations(); // Reset celebration flags when date range changes
                updateAdvanceCalculation();
                throttledChartUpdate();
                
                // Update orders table if it's visible on forecast page
                const forecastTableContainer = document.getElementById('orders-table-container-forecast');
                if (forecastTableContainer && forecastTableContainer.style.display !== 'none') {
                    populateOrdersTable('forecast', true); // Preserve pagination
                }
            }
        });
        console.log('Date range slider initialized with Ion Range Slider');
    }
    
    // Don't update the label yet - wait for CSV to load
    updateAdvanceCalculation(); // Initial calculation
    console.log('Advance calculation initialized');
}

// Throttled chart update for better performance
function throttledChartUpdate() {
    const now = Date.now();
    if (now - lastChartUpdate < CHART_UPDATE_THROTTLE) {
        if (chartAnimationFrame) {
            cancelAnimationFrame(chartAnimationFrame);
        }
        chartAnimationFrame = requestAnimationFrame(() => {
            createSalesChart();
            lastChartUpdate = now;
        });
    } else {
        createSalesChart();
        lastChartUpdate = now;
    }
}

// Helper function to convert slider value to date
function getDateFromSliderValue(sliderValue) {
    const baseDate = new Date(2025, 0, 1); // Jan 1, 2025
    const targetDate = new Date(baseDate);
    targetDate.setDate(baseDate.getDate() + parseInt(sliderValue));
    
    return targetDate.toISOString().split('T')[0];
}

// Update date range label based on slider values
function updateDateRangeLabel(data) {
    const dateRangeLabel = document.getElementById('date-range-label');
    
    if (dateRangeLabel && data) {
        const startDate = new Date(getDateFromSliderValue(data.from));
        const endDate = new Date(getDateFromSliderValue(data.to));
        
        const startFormatted = startDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        const endFormatted = endDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        
        // Just show the selected range
        dateRangeLabel.textContent = `${startFormatted} - ${endFormatted}`;
    }
}

// Update range slider with actual order date range
function updateRangeSliderWithOrderDates(orders) {
    if (!orders || orders.length === 0) return;
    
    const dateRangeSlider = document.getElementById('date-range-slider');
    if (!dateRangeSlider) return;
    
    const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
    if (!sliderInstance) return;
    
    // Find the actual date range from the orders
    const orderDates = orders.map(order => order.date).sort((a, b) => a - b);
    const earliestDate = new Date(orderDates[0]);
    const latestDate = new Date(orderDates[orderDates.length - 1]);
    
    console.log('Order date range:', earliestDate.toISOString(), 'to', latestDate.toISOString());
    
    // Calculate days from Jan 1, 2025 for the range
    const baseDate = new Date(2025, 0, 1);
    const earliestDays = Math.ceil((earliestDate - baseDate) / (1000 * 60 * 60 * 24));
    const latestDays = Math.ceil((latestDate - baseDate) / (1000 * 60 * 60 * 24));
    
    console.log('Days from Jan 1, 2025:', earliestDays, 'to', latestDays);
    
    // Calculate one week from now
    const today = new Date();
    const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const oneWeekFromNowDays = Math.ceil((oneWeekFromNow - baseDate) / (1000 * 60 * 60 * 24));
    
    // Update the slider range to cover from one week from now to the last order
    sliderInstance.update({
        min: Math.max(0, oneWeekFromNowDays), // Start from one week from now
        max: latestDays + 7, // End a week after latest order
        from: Math.max(0, oneWeekFromNowDays), // Start from one week from now
        to: latestDays // End at the last order
    });
    
    // Show the slider now that it's configured
    dateRangeSlider.style.display = 'block';
    
    // Force full width and constrain to chart width
    const sliderContainer = dateRangeSlider.closest('.slider-container');
    if (sliderContainer) {
        sliderContainer.style.width = '100%';
        sliderContainer.style.maxWidth = '100%';
        sliderContainer.style.overflow = 'hidden';
    }
    
    // Ensure the slider itself is constrained to chart width
    const chartContainer = document.querySelector('.chart-container');
    if (chartContainer) {
        const chartWidth = chartContainer.offsetWidth;
        if (sliderContainer) {
            sliderContainer.style.maxWidth = chartWidth + 'px';
            console.log('Constrained slider width to chart width:', chartWidth + 'px');
        }
    }
    
    // Update the date range label to show the new range
    updateDateRangeLabel({ from: oneWeekFromNowDays, to: latestDays });
    
    console.log(`Updated range slider: ${oneWeekFromNowDays} to ${latestDays} days from Jan 1, 2025`);
    console.log(`Slider now covers: ${oneWeekFromNow.toLocaleDateString()} to ${latestDate.toLocaleDateString()}`);
}

// Parse CSV orders
function parseCSVOrders(csvData) {
    console.log('Starting CSV parsing...');
    const lines = csvData.split('\n');
    console.log('Total lines in CSV:', lines.length);
    
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    console.log('CSV headers:', headers);
    
    // Find the relevant column indices
    const transactionIdIndex = headers.findIndex(h => h === 'TRANSACTIONID');
    const transactionDateIndex = headers.findIndex(h => h === 'TRANSACTIONDATETIME');
    const eventIdIndex = headers.findIndex(h => h === 'EVENTID');
    const eventDateIndex = headers.findIndex(h => h === 'EVENTDATETIME');
    const eventNameIndex = headers.findIndex(h => h === 'EVENTNAME');
    const amountIndex = headers.findIndex(h => h === 'POTENTIAL_EXPOSURE_USD');
    const mustShipByIndex = headers.findIndex(h => h === 'MUSTSHIPBY');
    
    if (transactionDateIndex === -1 || eventDateIndex === -1 || amountIndex === -1) {
        console.error('Required columns not found. Available columns:', headers);
        throw new Error('Required columns not found: TRANSACTIONDATETIME, EVENTDATETIME, and POTENTIAL_EXPOSURE_USD');
    }
    
    console.log(`Found columns: TRANSACTIONID at index ${transactionIdIndex}, TRANSACTIONDATETIME at index ${transactionDateIndex}, EVENTID at index ${eventIdIndex}, EVENTDATETIME at index ${eventDateIndex}, EVENTNAME at index ${eventNameIndex}, POTENTIAL_EXPOSURE_USD at index ${amountIndex}, MUSTSHIPBY at index ${mustShipByIndex}`);
    
    const orders = [];
    
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        
        const values = line.split(',').map(v => v.trim().replace(/"/g, ''));
        
        if (values.length > Math.max(transactionDateIndex, eventDateIndex, amountIndex)) {
            const transactionExcelDate = parseFloat(values[transactionDateIndex]);
            const eventExcelDate = parseFloat(values[eventDateIndex]);
            const amount = parseFloat(values[amountIndex]);
            
            if (!isNaN(transactionExcelDate) && !isNaN(eventExcelDate) && !isNaN(amount) && amount > 0) {
                try {
                    // Convert Excel dates to JavaScript Dates
                    const transactionDate = new Date((transactionExcelDate - 25569) * 86400 * 1000);
                    const eventDate = new Date((eventExcelDate - 25569) * 86400 * 1000);
                    
                    // Validate the dates
                    if (transactionDate.getTime() > 0 && eventDate.getTime() > 0) {
                        // Use event date if transaction date is in the past
                        const today = new Date();
                        const oneWeekFromNow = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
                        
                        // Determine which date to use for the order
                        let orderDate;
                        if (transactionDate < today) {
                            orderDate = eventDate;
                        } else {
                            orderDate = transactionDate;
                        }
                        
                        // Check if must ship by date is available and valid
                        let mustShipByDate = null;
                        if (values[mustShipByIndex] && values[mustShipByIndex].trim()) {
                            try {
                                const mustShipByExcel = parseFloat(values[mustShipByIndex]);
                                if (!isNaN(mustShipByExcel)) {
                                    mustShipByDate = new Date((mustShipByExcel - 25569) * 86400 * 1000);
                                }
                            } catch (error) {
                                console.warn('Could not parse must ship by date:', values[mustShipByIndex]);
                            }
                        }
                        
                        // Only include orders that are at least 1 week away from both event date and must ship by date
                        const eventDateOneWeekAway = eventDate >= oneWeekFromNow;
                        const mustShipByOneWeekAway = !mustShipByDate || mustShipByDate >= oneWeekFromNow;
                        
                        if (eventDateOneWeekAway && mustShipByOneWeekAway) {
                            orders.push({
                                date: orderDate,
                                amount: amount,
                                transactionDate: transactionDate,
                                eventDate: eventDate,
                                transactionId: values[transactionIdIndex] || 'N/A',
                                eventId: values[eventIdIndex] || 'N/A',
                                eventName: values[eventNameIndex] || 'Event',
                                mustShipBy: mustShipByDate
                            });
                        }
                    } else {
                        console.warn('Invalid date from Excel values:', { transaction: transactionExcelDate, event: eventExcelDate }, 'for line:', i);
                    }
                } catch (dateError) {
                    console.warn('Error parsing dates from Excel values:', { transaction: transactionExcelDate, event: eventExcelDate }, 'for line:', i, 'Error:', dateError);
                }
            }
        }
    }
    
    console.log(`Parsed ${orders.length} orders from CSV after filtering out orders within 1 week`);
    if (orders.length > 0) {
        const totalAmount = orders.reduce((sum, order) => sum + order.amount, 0);
        const dateRange = {
            start: new Date(Math.min(...orders.map(o => o.date))),
            end: new Date(Math.max(...orders.map(o => o.date)))
        };
        console.log(`Total amount: $${totalAmount.toLocaleString()}`);
        console.log(`Date range: ${dateRange.start.toLocaleDateString()} to ${dateRange.end.toLocaleDateString()}`);
    }
    return orders;
}

// Update CSV status display
function updateCSVStatus(message) {
    const statusElement = document.getElementById('csv-status');
    if (statusElement) {
        statusElement.textContent = message;
        statusElement.style.color = message.includes('Error') ? '#dc2626' : 
                                  message.includes('Successfully') ? '#059669' : '#166534';
    }
}

// Load Confirmations.csv automatically
async function loadDefaultCSV() {
    try {
        updateCSVStatus('Loading Confirmations.csv...');
        console.log('Attempting to fetch Confirmations.csv...');
        
        const response = await fetch('Confirmations.csv');
        console.log('Fetch response:', response.status, response.statusText);
        
        if (response.ok) {
            const csvData = await response.text();
            console.log('CSV data length:', csvData.length);
            console.log('First 500 characters of CSV:', csvData.substring(0, 500));
            
            const orders = parseCSVOrders(csvData);
            console.log('Parsed orders after filtering:', orders.length);
            
            if (orders.length > 0) {
                globalOrders = orders;
                
                // Update range slider with actual order date range
                updateRangeSliderWithOrderDates(orders);
                
                updateCSVStatus(`Loaded ${orders.length} orders from Confirmations.csv (filtered out orders within 1 week)`);
                console.log(`Loaded ${orders.length} orders with total value: $${orders.reduce((sum, order) => sum + order.amount, 0).toLocaleString()}`);
            } else {
                updateCSVStatus('No valid orders found in Confirmations.csv after filtering');
            }
        } else {
            updateCSVStatus('Could not load Confirmations.csv - file not found');
            console.error('CSV fetch failed:', response.status, response.statusText);
        }
    } catch (error) {
        console.error('Error loading Confirmations.csv:', error);
        updateCSVStatus('Error loading Confirmations.csv - check console for details');
        throw error; // Re-throw to be caught by caller
    }
}

// Generate default orders from CSV if available, otherwise empty array
function generateRandomOrders() {
    console.log('No CSV data loaded, returning empty orders array');
    return [];
}

// Get orders for selected date range
function getOrdersForDateRange(startDate, endDate) {
    console.log('Getting orders for date range:', startDate, 'to', endDate);
    
    // If no orders loaded, return empty
    if (!globalOrders || globalOrders.length === 0) {
        console.log('No orders loaded, returning empty result');
        return {
            orders: [],
            totalAmount: 0
        };
    }
    
    // If no dates selected, return all orders
    if (!startDate || !endDate) {
        const totalAmount = globalOrders.reduce((sum, order) => sum + order.amount, 0);
        console.log('No dates selected, returning all orders:', totalAmount);
        return {
            orders: globalOrders,
            totalAmount: totalAmount
        };
    }
    
    // Parse dates and validate
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    console.log('Parsed dates:', { start: start.toISOString(), end: end.toISOString() });
    
    // Check if dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        console.log('Invalid dates, returning all orders');
        const totalAmount = globalOrders.reduce((sum, order) => sum + order.amount, 0);
        return {
            orders: globalOrders,
            totalAmount: totalAmount
        };
    }
    
    // Filter orders within date range
    const filteredOrders = globalOrders.filter(order => {
        const orderDate = new Date(order.date);
        const isInRange = orderDate >= start && orderDate <= end;
        return isInRange;
    });
    
    const totalAmount = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
    console.log('Filtered orders:', filteredOrders.length, 'orders totaling $' + totalAmount.toLocaleString());
    
    return {
        orders: filteredOrders,
        totalAmount: totalAmount
    };
}

// Get orders for specifically selected bars (individual weeks)
function getOrdersForSelectedBars() {
    console.log('Getting orders for selected bars:', selectedBars);
    
    // If no orders loaded, return empty
    if (!globalOrders || globalOrders.length === 0) {
        console.log('No orders loaded, returning empty result');
        return {
            orders: [],
            totalAmount: 0
        };
    }
    
    // If no bars selected, return all orders
    if (selectedBars.length === 0) {
        const totalAmount = globalOrders.reduce((sum, order) => sum + order.amount, 0);
        console.log('No bars selected, returning all orders:', totalAmount);
        return {
            orders: globalOrders,
            totalAmount: totalAmount
        };
    }
    
    // Get the week labels for each selected bar
    const selectedWeeks = selectedBars.map(barIndex => {
        const label = chartData.labels[barIndex];
        return { label, index: barIndex };
    });
    
    console.log('Selected weeks:', selectedWeeks);
    
    // Filter orders to only include the specifically selected weeks
    const filteredOrders = globalOrders.filter(order => {
        const orderDate = new Date(order.date);
        const orderDateStr = orderDate.toISOString().split('T')[0];
        
        // Check if this order is in any of the selected weeks
        return selectedWeeks.some(selected => {
            const weekLabel = selected.label;
            // Parse week label (format: "Jan 1 - Jan 7")
            const startMatch = weekLabel.match(/(\w+ \d+)/);
            const endMatch = weekLabel.match(/- (\w+ \d+)/);
            
            if (startMatch && endMatch) {
                const startDate = new Date(startMatch[1] + ', 2025');
                const endDate = new Date(endMatch[1] + ', 2025');
                
                return orderDate >= startDate && orderDate <= endDate;
            }
            return false;
        });
    });
    
    const totalAmount = filteredOrders.reduce((sum, order) => sum + order.amount, 0);
    console.log('Filtered orders for selected bars:', filteredOrders.length, 'orders totaling $' + totalAmount.toLocaleString());
    
    return {
        orders: filteredOrders,
        totalAmount: totalAmount
    };
}

// Update revenue display in the center of the chart
function updateRevenueDisplay(amount, baseAmount, bonus200k, bonus500k) {
    // Update base amount
    const revenueBaseAmount = document.getElementById('revenue-base-amount');
    if (revenueBaseAmount) {
        const formattedBaseAmount = parseFloat(baseAmount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        revenueBaseAmount.textContent = '$' + formattedBaseAmount;
    }
    
    // Update tier 1 bonus
    const revenueBonus200kItem = document.getElementById('revenue-bonus-200k-item');
    const revenueBonus200k = document.getElementById('revenue-bonus-200k');
    if (revenueBonus200kItem && revenueBonus200k) {
        if (bonus200k > 0) {
            revenueBonus200kItem.style.display = 'flex';
            const formattedBonus200k = parseFloat(bonus200k).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            revenueBonus200k.textContent = '$' + formattedBonus200k;
        } else {
            revenueBonus200kItem.style.display = 'none';
        }
    }
    
    // Update tier 2 bonus
    const revenueBonus500kItem = document.getElementById('revenue-bonus-500k-item');
    const revenueBonus500k = document.getElementById('revenue-bonus-500k');
    if (revenueBonus500kItem && revenueBonus500k) {
        if (bonus500k > 0) {
            revenueBonus500kItem.style.display = 'flex';
            const formattedBonus500k = parseFloat(bonus500k).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            revenueBonus500k.textContent = '$' + formattedBonus500k;
        } else {
            revenueBonus500kItem.style.display = 'none';
        }
    }
    
    // Update total amount
    const revenueTotalAmount = document.getElementById('revenue-total-amount');
    if (revenueTotalAmount) {
        const formattedAmount = parseFloat(amount || 0).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        revenueTotalAmount.textContent = '$' + formattedAmount;
    }
}

// Update Advance Calculation
function updateAdvanceCalculation() {
    console.log('Updating advance calculation');
    const eligibleSalesElement = document.getElementById('eligible-sales');
    const youWillReceiveElement = document.getElementById('you-will-receive');
    const forecastAmountElement = document.getElementById('forecast-amount');
    
    if (!eligibleSalesElement || !youWillReceiveElement) {
        console.error('Required elements not found for advance calculation');
        return;
    }
    
    // Get orders for selected date range
    const dateRangeSlider = document.getElementById('date-range-slider');
    let startDate, endDate;
    
    if (dateRangeSlider) {
        const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
        if (sliderInstance) {
            startDate = getDateFromSliderValue(sliderInstance.result.from);
            endDate = getDateFromSliderValue(sliderInstance.result.to);
        }
    }
    
    console.log('Date inputs:', { startDate, endDate });
    
    // If we have selected bars, calculate based on those specific weeks
    let orderData, baseAmount;
    
    if (selectedBars.length > 0) {
        // Calculate sales for only the specifically selected weeks
        orderData = getOrdersForSelectedBars();
        baseAmount = orderData.totalAmount || 0;
    } else {
        // Use date range if no bars are selected
        orderData = getOrdersForDateRange(startDate, endDate);
        baseAmount = orderData.totalAmount || 0;
    }
    
    console.log('Order data:', orderData);
    console.log('Base amount:', baseAmount);
    
    if (!orderData || !orderData.orders || orderData.orders.length === 0) {
        eligibleSalesElement.textContent = '$0';
        youWillReceiveElement.textContent = '$0';
        return;
    }
    
    const receivablesAmount = orderData.totalAmount;
    const orders = orderData.orders;
    
    // Calculate fees for each order: fee = (0.65% * weeks till in hand date) * expected proceeds
    // Plus tiered bonuses: +50 bps at $200k, +50 bps at $500k
    let totalFees = 0;
    const ordersWithFees = orders.map(order => {
        // Calculate weeks from order date to "in hand" date
        // For now, assuming "in hand" date is 8 weeks from order date
        // This could be made configurable or based on actual order data
        const orderDate = new Date(order.date);
        const inHandDate = new Date(orderDate);
        inHandDate.setDate(orderDate.getDate() + 56); // 8 weeks = 56 days
        
        const today = new Date();
        const weeksTillInHand = Math.max(0, Math.ceil((inHandDate - today) / (1000 * 60 * 60 * 24 * 7)));
        
        // Calculate base fee: 0.65% per week * expected proceeds
        const baseFeeRate = 0.0065 * weeksTillInHand; // 0.65% per week
        let fee = order.amount * baseFeeRate;
        
        // Note: Tiered bonuses are now calculated as rebates separately, not as additional fees
        
        totalFees += fee;
        
        return {
            ...order,
            weeksTillInHand,
            fee,
            inHandDate: inHandDate.toISOString().split('T')[0]
        };
    });
    
    // Calculate base fees first
    const baseFees = ordersWithFees.reduce((sum, order) => {
        const baseFeeRate = 0.0065 * order.weeksTillInHand;
        return sum + (order.amount * baseFeeRate);
    }, 0);
    
    // Calculate net receivables amount (receivables - base fee) for milestone checking
    const netReceivables = receivablesAmount - baseFees;
    
    // Calculate bonuses as rebates (money back) based on net receivables amount
    const bonus200k = netReceivables >= 200000 ? netReceivables * 0.005 : 0;
    const bonus500k = netReceivables >= 500000 ? netReceivables * 0.005 : 0;
    
    // Calculate final advance amount: receivables - base fees + bonuses
    const advanceAmount = receivablesAmount - baseFees + bonus200k + bonus500k;
    
    // Store the current advance amount globally for chart display
    currentAdvanceAmount = advanceAmount;
    
    // Update gamified achievement system
    updateAchievementProgress(receivablesAmount, baseFees, ordersWithFees);
    
    console.log('Advance calculation:', {
        receivablesAmount,
        baseFees,
        bonus200k,
        bonus500k,
        advanceAmount,
        orderCount: orders.length,
        ordersWithFees
    });
    
    // Update UI - ensure all values are numbers and format properly
    console.log('Updating UI elements:', {
        baseAmount: baseAmount,
        receivablesAmount: receivablesAmount,
        advanceAmount: advanceAmount,
        orderCount: orderData.orders.length
    });
    
    if (forecastAmountElement) {
        const displayAmount = baseAmount || 0;
        forecastAmountElement.textContent = '$' + displayAmount.toLocaleString();
        console.log('Updated forecast amount to:', displayAmount);
    }
    
    const orderCountElement = document.getElementById('order-count');
    if (orderCountElement) {
        const count = orderData.orders.length || 0;
        orderCountElement.textContent = count.toLocaleString() + '+';
        console.log('Updated order count to:', count);
    }
    
    // Update revenue display in chart center - show the breakdown
    const netReceivablesForDisplay = receivablesAmount - baseFees;
    updateRevenueDisplay(advanceAmount || 0, netReceivablesForDisplay, bonus200k, bonus500k);
    
    // Update breakdown display - total fees is just the base fee since bonuses are rebates
    updateBreakdownDisplay(receivablesAmount, baseFees, bonus200k, bonus500k, baseFees, advanceAmount);
    
    // Format with commas and 2 decimal places
    const formattedReceivables = parseFloat(receivablesAmount || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    const formattedAdvance = parseFloat(advanceAmount || 0).toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
    
    eligibleSalesElement.textContent = '$' + formattedReceivables;
    youWillReceiveElement.textContent = '$' + formattedAdvance;
    
    // Update orders table if it's visible on forecast page
    const forecastTableContainer = document.getElementById('orders-table-container-forecast');
    if (forecastTableContainer && forecastTableContainer.style.display !== 'none') {
        populateOrdersTable('forecast', true); // Preserve pagination
    }
}

// Calculate offer details based on eligible orders
function calculateOfferDetails() {
    console.log('Calculating offer details');
    
    // Get the current eligible orders (same logic as updateAdvanceCalculation)
    const dateRangeSlider = document.getElementById('date-range-slider');
    let startDate, endDate;
    
    if (dateRangeSlider) {
        const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
        if (sliderInstance) {
            startDate = getDateFromSliderValue(sliderInstance.result.from);
            endDate = getDateFromSliderValue(sliderInstance.result.to);
        }
    }
    
    let orderData;
    if (selectedBars.length > 0) {
        orderData = getOrdersForSelectedBars();
    } else {
        orderData = getOrdersForDateRange(startDate, endDate);
    }
    
    if (!orderData || !orderData.orders || orderData.orders.length === 0) {
        console.log('No eligible orders found');
        return {
            receivablesAmount: 0,
            totalFees: 0,
            advanceAmount: 0,
            orders: []
        };
    }
    
    const receivablesAmount = orderData.totalAmount;
    const orders = orderData.orders;
    
    // Calculate fees for each order: fee = (0.65% * weeks till in hand date) * expected proceeds
    // Plus tiered bonuses: +50 bps at $200k, +50 bps at $500k
    let totalFees = 0;
    const ordersWithFees = orders.map(order => {
        // Calculate weeks from order date to "in hand" date
        // For now, assuming "in hand" date is 8 weeks from order date
        // This could be made configurable or based on actual order data
        const orderDate = new Date(order.date);
        const inHandDate = new Date(orderDate);
        inHandDate.setDate(orderDate.getDate() + 56); // 8 weeks = 56 days
        
        const today = new Date();
        const weeksTillInHand = Math.max(0, Math.ceil((inHandDate - today) / (1000 * 60 * 60 * 24 * 7)));
        
        // Calculate base fee: 0.65% per week * expected proceeds
        const baseFeeRate = 0.0065 * weeksTillInHand; // 0.65% per week
        let fee = order.amount * baseFeeRate;
        
        // Note: Tiered bonuses are now calculated as rebates separately, not as additional fees
        
        totalFees += fee;
        
        return {
            ...order,
            weeksTillInHand,
            fee,
            inHandDate: inHandDate.toISOString().split('T')[0]
        };
    });
    
    // Calculate base fees first
    const baseFees = ordersWithFees.reduce((sum, order) => {
        const baseFeeRate = 0.0065 * order.weeksTillInHand;
        return sum + (order.amount * baseFeeRate);
    }, 0);
    
    // Calculate net receivables amount (receivables - base fee) for milestone checking
    const netReceivables = receivablesAmount - baseFees;
    
    // Calculate bonuses as rebates (money back) based on net receivables amount
    const bonus200k = netReceivables >= 200000 ? netReceivables * 0.005 : 0;
    const bonus500k = netReceivables >= 500000 ? netReceivables * 0.005 : 0;
    
    // Calculate final advance amount: receivables - base fees + bonuses
    const advanceAmount = receivablesAmount - baseFees + bonus200k + bonus500k;
    
    // Store the current advance amount globally for chart display
    currentAdvanceAmount = advanceAmount;
    
    console.log('Offer calculation:', {
        receivablesAmount,
        baseFees,
        bonus200k,
        bonus500k,
        advanceAmount,
        orderCount: orders.length,
        ordersWithFees
    });
    
    return {
        receivablesAmount,
        totalFees: baseFees, // Total fees is just the base fee since bonuses are rebates
        advanceAmount,
        orders: ordersWithFees
    };
}

// Populate offer page with calculated data
function populateOfferPage() {
    console.log('Populating offer page');
    
            const offerDetails = calculateOfferDetails();
        
        // Update receivables amount - find the first amount-large element
        const receivablesElements = document.querySelectorAll('#offer-page .amount-large');
        if (receivablesElements.length > 0) {
            const formattedReceivables = parseFloat(offerDetails.receivablesAmount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            receivablesElements[0].textContent = '$' + formattedReceivables;
        } else {
            console.error('Receivables element not found');
        }
        
        // Update advance amount - find the amount-large element with primary class
        const advanceElements = document.querySelectorAll('#offer-page .amount-large.primary');
        if (advanceElements.length > 0) {
            const formattedAdvance = parseFloat(offerDetails.advanceAmount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            advanceElements[0].textContent = '$' + formattedAdvance;
        } else {
            console.error('Advance amount element not found');
        }
    
    // Update fee tag if it exists
    const feeTagElement = document.querySelector('#offer-page .fee-tag');
    if (feeTagElement && offerDetails.receivablesAmount > 0) {
        const feePercentage = ((offerDetails.totalFees / offerDetails.receivablesAmount) * 100).toFixed(1);
        feeTagElement.textContent = feePercentage + '% Fee';
        console.log('Updated fee tag to:', feePercentage + '% Fee');
    }
    
    // Hide the entire customize amount section on advance offer page
    const customizeSection = document.querySelector('#offer-page .customize-section');
    if (customizeSection) {
        customizeSection.style.display = 'none';
        console.log('Hidden customize section');
    }
    
    // Update slider values - but disable customization on advance offer page
    const amountSlider = document.getElementById('amount-slider');
    if (amountSlider) {
        amountSlider.min = Math.max(50000, Math.floor(offerDetails.advanceAmount * 0.5)); // Min 50% of advance amount
        amountSlider.max = Math.floor(offerDetails.advanceAmount);
        amountSlider.value = offerDetails.advanceAmount;
        
        // Disable the slider to prevent customization on advance offer page
        amountSlider.disabled = true;
        
        // Update slider labels
        const sliderLabels = document.querySelectorAll('#offer-page .slider-labels span');
        if (sliderLabels.length >= 2) {
            sliderLabels[0].textContent = '$' + (amountSlider.min / 1000).toFixed(0) + 'k';
            sliderLabels[1].textContent = '$' + (amountSlider.max / 1000).toFixed(0) + 'k';
        }
        
        // Update slider value display
        const sliderValueElement = document.getElementById('slider-amount');
        if (sliderValueElement) {
            const formattedSliderAmount = parseFloat(offerDetails.advanceAmount).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
            sliderValueElement.textContent = '$' + formattedSliderAmount;
        }
        
        // Update slider details
        updateSliderDetails(offerDetails.advanceAmount, offerDetails.totalFees);
        
        console.log('Updated slider values');
    }
    
    console.log('Offer page population completed');
}

// Update slider details when slider value changes
function updateSliderDetails(advanceAmount, totalFees) {
    const sliderAdvanceElement = document.getElementById('slider-advance');
    const sliderFeeElement = document.getElementById('slider-fee');
    
    if (sliderAdvanceElement) {
        const formattedAdvance = parseFloat(advanceAmount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        sliderAdvanceElement.textContent = '$' + formattedAdvance;
    }
    
    if (sliderFeeElement) {
        const formattedFees = parseFloat(totalFees).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        sliderFeeElement.textContent = '$' + formattedFees;
    }
}

// Populate terms page with calculated data
function populateTermsPage() {
    console.log('Populating terms page');
    
    const offerDetails = calculateOfferDetails();
    
    // Update terms page amounts
    const termsAdvanceElement = document.getElementById('terms-advance-amount');
    const termsReceivablesElement = document.getElementById('terms-receivables-amount');
    
    if (termsAdvanceElement) {
        const formattedTermsAdvance = parseFloat(offerDetails.advanceAmount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        termsAdvanceElement.textContent = '$' + formattedTermsAdvance;
    }
    
    if (termsReceivablesElement) {
        const formattedTermsReceivables = parseFloat(offerDetails.receivablesAmount).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
        termsReceivablesElement.textContent = '$' + formattedTermsReceivables;
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, initializing application');
    
    // Ensure only the forecast page is visible initially
    console.log('Setting initial page visibility');
    const pages = document.querySelectorAll('#page-container > .page');
    pages.forEach(page => {
        page.classList.remove('active');
        page.style.display = 'none';
    });
    
    // Show only the forecast page
    const forecastPage = document.getElementById('forecast-page');
    if (forecastPage) {
        forecastPage.classList.add('active');
        console.log('Forecast page set as active');
    }
    
    // Add roundRect polyfill for older browsers
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
            if (width < 2 * radius) radius = width / 2;
            if (height < 2 * radius) radius = height / 2;
            this.beginPath();
            this.moveTo(x + radius, y);
            this.arcTo(x + width, y, x + width, y + height, radius);
            this.arcTo(x + width, y + height, x, y + height, radius);
            this.arcTo(x, y + height, x, y, radius);
            this.arcTo(x, y, x + width, y, radius);
            this.closePath();
            return this;
        };
    }
    
    // Initialize components
    initializeAdvanceSlider();
    
    // Add resize handler to keep slider aligned with chart
    window.addEventListener('resize', function() {
        const sliderContainer = document.querySelector('.slider-container');
        const chartContainer = document.querySelector('.chart-container');
        if (sliderContainer && chartContainer) {
            const chartWidth = chartContainer.offsetWidth;
            sliderContainer.style.maxWidth = chartWidth + 'px';
            console.log('Resized slider width to match chart:', chartWidth + 'px');
        }
    });
    
    // Try to load the CSV file automatically
    loadDefaultCSV().then(() => {
        // Initial calculation first
        updateAdvanceCalculation();
        // Create chart after CSV is loaded and calculation is complete
        createSalesChart();
    }).catch(() => {
        // If CSV fails, still create empty chart
        updateAdvanceCalculation();
        createSalesChart();
    });
});

// Simple chart data
let chartData = {
    labels: [],
    values: [],
    barPositions: [],
    earliestDate: null
};

// Create Sales Chart - Daily data visualization
function createSalesChart() {
    console.log('Creating daily sales chart');
    
    const canvas = document.getElementById('sales-chart');
    if (!canvas) {
        console.error('Sales chart canvas not found');
        return;
    }
    
    // Make canvas responsive to container width
    const container = canvas.parentElement;
    canvas.width = container.clientWidth;
    canvas.height = 400;
    
    const ctx = canvas.getContext('2d');
    const orders = globalOrders || [];
    
    // Get date range from range slider
    const dateRangeSlider = document.getElementById('date-range-slider');
    let selectedStartDate, selectedEndDate;
    
    if (dateRangeSlider && dateRangeSlider.value) {
        const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
        if (sliderInstance) {
            selectedStartDate = new Date(getDateFromSliderValue(sliderInstance.result.from));
            selectedEndDate = new Date(getDateFromSliderValue(sliderInstance.result.to));
            console.log('Slider selected range:', selectedStartDate.toISOString(), 'to', selectedEndDate.toISOString());
        }
    }
    
    // Clear previous data
    chartData.labels = [];
    chartData.values = [];
    chartData.barPositions = [];
    
    // Chart dimensions - declare these first
    const width = canvas.width;
    const height = canvas.height;
    const padding = 80;
    const chartWidth = width - 2 * padding;
    const chartHeight = height - 2 * padding;
    
    // If no orders, create empty chart
    if (!orders || orders.length === 0) {
        chartData.labels = ['No Data'];
        chartData.values = [0];
        
        // Draw empty chart message
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        
        ctx.fillStyle = '#64748b';
        ctx.font = '16px Inter';
        ctx.textAlign = 'center';
        ctx.fillText('Loading orders from Confirmations.csv...', width / 2, height / 2);
        
        return;
    }
    
    // Find the actual date range from the orders (earliest to latest)
    const orderDates = orders.map(order => order.date).sort((a, b) => a - b);
    const earliestDate = new Date(orderDates[0]);
    const latestDate = new Date(orderDates[orderDates.length - 1]);
    
    // Store earliestDate in chartData for use in tooltips
    chartData.earliestDate = earliestDate;
    
    console.log('Chart data range:', earliestDate.toISOString(), 'to', latestDate.toISOString());
    
    // Create daily data structure for the actual order date range
    const dailyData = {};
    const currentDate = new Date(earliestDate);
    
    while (currentDate <= latestDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        dailyData[dateKey] = 0;
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    // Group orders by date for the actual range
    orders.forEach(order => {
        const orderDate = order.date.toISOString().split('T')[0];
        if (dailyData[orderDate] !== undefined) {
            dailyData[orderDate] += order.amount;
        }
    });
    
    // Prepare chart data - daily bars with clean month-only labeling
    const dailyDataArray = [];
    const dailyLabels = [];
    
    currentDate.setTime(earliestDate.getTime());
    
    while (currentDate <= latestDate) {
        const dateKey = currentDate.toISOString().split('T')[0];
        const dayTotal = dailyData[dateKey] || 0;
        
        dailyDataArray.push(dayTotal);
        
        // Only show month labels at the start of each month
        if (currentDate.getDate() === 1) {
            dailyLabels.push(currentDate.toLocaleDateString('en-US', { month: 'short' }));
        } else {
            dailyLabels.push(''); // Empty label for most days
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    chartData.labels = dailyLabels;
    chartData.values = dailyDataArray;
    
    // Clear canvas
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    
    // Find max value for scaling
    const maxValue = Math.max(...chartData.values);
    
    // Note: Revenue display is updated by the main calculation function
    // No need to update it here as it would overwrite the correct values
    
    // Draw grid lines with modern styling
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1;
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
        const y = padding + (i * chartHeight / gridLines);
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }
    
    // Draw bars with modern colors and improved performance
    const barWidth = chartWidth / chartData.labels.length;
    const barSpacing = barWidth * 0.15;
    const actualBarWidth = barWidth - barSpacing;
    
    chartData.labels.forEach((label, index) => {
        const value = chartData.values[index];
        const barHeight = (value / maxValue) * chartHeight;
        const x = padding + index * barWidth + barSpacing / 2;
        const y = height - padding - barHeight;
        
        // Store bar position for hover detection
        chartData.barPositions[index] = {
            x: x,
            y: y,
            width: actualBarWidth,
            height: barHeight,
            label: label,
            value: value,
            index: index
        };
        
        // Check if this day is within the selected date range
        let isInSelectedRange = false;
        
        if (selectedStartDate && selectedEndDate) {
            // Calculate the date for this bar based on its index
            const barDate = new Date(earliestDate);
            barDate.setDate(earliestDate.getDate() + index);
            
            // Check if day is within selected range
            isInSelectedRange = (barDate >= selectedStartDate && barDate <= selectedEndDate);
        }
        
        // Bar color - selected bars are teal, in-range bars are highlighted, others are purple
        if (selectedBars.includes(index)) {
            // Create gradient for selected bars
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, '#10b981');
            gradient.addColorStop(1, '#059669');
            ctx.fillStyle = gradient;
        } else if (isInSelectedRange) {
            // Create gradient for range bars
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, '#f59e0b');
            gradient.addColorStop(1, '#f97316');
            ctx.fillStyle = gradient;
        } else {
            // Create gradient for regular bars
            const gradient = ctx.createLinearGradient(x, y, x, y + barHeight);
            gradient.addColorStop(0, '#8b5cf6');
            gradient.addColorStop(1, '#a855f7');
            ctx.fillStyle = gradient;
        }
        
        // Draw bar with rounded corners effect
        ctx.beginPath();
        ctx.roundRect(x, y, actualBarWidth, barHeight, 4);
        ctx.fill();
        
        // Add subtle shadow effect
        ctx.shadowColor = 'rgba(0, 0, 0, 0.1)';
        ctx.shadowBlur = 4;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 2;
    });
    
    // Reset shadow for text
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    
    // Draw month labels with modern styling
    ctx.fillStyle = '#374151';
    ctx.font = '600 12px Inter';
    ctx.textAlign = 'center';
    chartData.labels.forEach((label, index) => {
        if (label) { // Only draw non-empty labels (months)
            const x = padding + index * barWidth + barWidth / 2;
            const y = height - 20;
            ctx.fillText(label, x, y);
        }
    });
    
    // Draw slider range indicator on chart
    if (selectedStartDate && selectedEndDate) {
        // Calculate the position of the slider range on the chart
        const baseDate = new Date(2025, 0, 1);
        const startDays = Math.ceil((selectedStartDate - baseDate) / (1000 * 60 * 60 * 24));
        const endDays = Math.ceil((selectedEndDate - baseDate) / (1000 * 60 * 60 * 24));
        const earliestDays = Math.ceil((earliestDate - baseDate) / (1000 * 60 * 60 * 24));
        
        const startIndex = Math.max(0, startDays - earliestDays);
        const endIndex = Math.min(chartData.labels.length - 1, endDays - earliestDays);
        
        if (startIndex >= 0 && endIndex >= startIndex) {
            const startX = padding + startIndex * barWidth;
            const endX = padding + (endIndex + 1) * barWidth;
            
            // Draw a subtle background highlight for the selected range
            ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
            ctx.fillRect(startX, padding, endX - startX, chartHeight);
            
            // Draw vertical lines to mark the range boundaries
            ctx.strokeStyle = '#f59e0b';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 5]);
            
            ctx.beginPath();
            ctx.moveTo(startX, padding);
            ctx.lineTo(startX, height - padding);
            ctx.stroke();
            
            ctx.beginPath();
            ctx.moveTo(endX, padding);
            ctx.lineTo(endX, height - padding);
            ctx.stroke();
            
            // Reset line style
            ctx.setLineDash([]);
            ctx.lineWidth = 1;
        }
    }
    
    // Draw milestone lines (200k and 500k)
    const milestone200k = 200000;
    const milestone500k = 500000;
    
    // Draw 200k milestone line
    if (milestone200k <= maxValue) {
        const y200k = padding + chartHeight - (milestone200k / maxValue) * chartHeight;
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, y200k);
        ctx.lineTo(width - padding, y200k);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Add 200k label
        ctx.fillStyle = '#f59e0b';
        ctx.font = '600 12px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('🏆 $200K Milestone', padding + 10, y200k - 5);
    }
    
    // Draw 500k milestone line
    if (milestone500k <= maxValue) {
        const y500k = padding + chartHeight - (milestone500k / maxValue) * chartHeight;
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(padding, y500k);
        ctx.lineTo(width - padding, y500k);
        ctx.stroke();
        ctx.setLineDash([]);
        
        // Add 500k label
        ctx.fillStyle = '#10b981';
        ctx.font = '600 12px Inter';
        ctx.textAlign = 'left';
        ctx.fillText('💎 $500K Milestone', padding + 10, y500k - 5);
    }

    // Draw Y-axis labels with modern styling
    ctx.fillStyle = '#64748b';
    ctx.font = '600 12px Inter';
    ctx.textAlign = 'right';
    for (let i = 0; i <= gridLines; i++) {
        const y = padding + (i * chartHeight / gridLines);
        const value = (maxValue * (gridLines - i) / gridLines);
        const label = `$${(value/1000).toFixed(0)}K`;
        ctx.fillText(label, padding - 10, y + 4);
    }
    
    console.log('Chart created with daily data, clean month labels');
    console.log('Bar positions stored:', chartData.barPositions.length);
    console.log('Selected bars:', selectedBars);
    console.log('Selected date range:', selectedStartDate, 'to', selectedEndDate);
    
    // Add event listeners
    canvas.addEventListener('mousemove', handleChartMouseMove);
    canvas.addEventListener('mouseleave', hideTooltip);
    canvas.style.cursor = 'default';
}

// Simple mouse move handler
function handleChartMouseMove(e) {
    const rect = e.target.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Find which bar is being hovered
    for (let i = 0; i < chartData.barPositions.length; i++) {
        const bar = chartData.barPositions[i];
        
        if (mouseX >= bar.x && mouseX <= bar.x + bar.width && 
            mouseY >= bar.y && mouseY <= bar.y + bar.height) {
            
            // Calculate the actual date for this bar
            if (chartData.earliestDate) {
                const barDate = new Date(chartData.earliestDate);
                barDate.setDate(chartData.earliestDate.getDate() + i);
                const formattedDate = barDate.toLocaleDateString('en-US', { 
                    month: 'short', 
                    day: 'numeric', 
                    year: 'numeric' 
                });
                
                console.log(`Hovering over bar ${i}: ${formattedDate} - $${bar.value.toLocaleString()} (daily total)`);
                
                // Show tooltip with date and amount
                const tooltipX = rect.left + bar.x + bar.width / 2;
                const tooltipY = rect.top + bar.y - 10;
                showTooltip(tooltipX, tooltipY, `${formattedDate}: $${bar.value.toLocaleString()}`);
            } else {
                // Fallback to just the amount if date is not available
                console.log(`Hovering over bar ${i}: ${bar.label} - $${bar.value.toLocaleString()} (daily total)`);
                
                const tooltipX = rect.left + bar.x + bar.width / 2;
                const tooltipY = rect.top + bar.y - 10;
                showTooltip(tooltipX, tooltipY, `${bar.label}: $${bar.value.toLocaleString()}`);
            }
            return;
        }
    }
    hideTooltip();
}



// Simple tooltip functions
function showTooltip(x, y, text) {
    let tooltip = document.getElementById('chart-tooltip');
    if (!tooltip) {
        tooltip = document.createElement('div');
        tooltip.id = 'chart-tooltip';
        tooltip.style.cssText = `
            position: fixed;
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(20px);
            color: #1e293b;
            padding: 12px 20px;
            border-radius: 12px;
            font-size: 13px;
            font-weight: 600;
            font-family: 'Inter', sans-serif;
            pointer-events: none;
            z-index: 1000;
            display: none;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.15);
            border: 1px solid rgba(255, 255, 255, 0.3);
            font-weight: 700;
        `;
        document.body.appendChild(tooltip);
    }
    
    tooltip.textContent = text;
    tooltip.style.left = (x + 10) + 'px';
    tooltip.style.top = (y - 30) + 'px';
    tooltip.style.display = 'block';
}

function hideTooltip() {
    const tooltip = document.getElementById('chart-tooltip');
    if (tooltip) {
        tooltip.style.display = 'none';
    }
}

// Update chart when dates change
function updateChartForDateRange(startDate, endDate) {
    console.log('Updating chart for date range:', startDate, 'to', endDate);
    // Just redraw the chart with current selections
    createSalesChart();
}

// Customize Offer Function
function showCustomizeOffer() {
    console.log('Customize offer clicked');
    
    // Create a simple modal for amount customization
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    `;
    
    modal.innerHTML = `
        <div style="
            background: white;
            padding: 32px;
            border-radius: 12px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
        ">
            <h3 style="margin-bottom: 24px; color: #1e293b;">Customize Your Advance Amount</h3>
            <div style="margin-bottom: 24px;">
                <label style="display: block; margin-bottom: 8px; font-weight: 500;">Advance Amount ($)</label>
                <input type="number" id="custom-amount" value="93000" min="1000" max="100000" 
                       style="width: 100%; padding: 12px; border: 2px solid #e5e7eb; border-radius: 8px; font-size: 16px;">
            </div>
            <div style="display: flex; gap: 12px;">
                <button onclick="closeCustomizeModal()" style="
                    padding: 12px 24px;
                    border: 1px solid #d1d5db;
                    background: white;
                    border-radius: 8px;
                    cursor: pointer;
                    flex: 1;
                ">Cancel</button>
                <button onclick="applyCustomAmount()" style="
                    padding: 12px 24px;
                    background: #6f42c1;
                    color: white;
                    border: none;
                    border-radius: 8px;
                    cursor: pointer;
                    flex: 1;
                ">Apply</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    console.log('Customize modal opened');
}

// Close Customize Modal
function closeCustomizeModal() {
    console.log('Closing customize modal');
    const modal = document.querySelector('div[style*="position: fixed"]');
    if (modal) {
        modal.remove();
    }
}

// Apply Custom Amount
function applyCustomAmount() {
    const customAmount = document.getElementById('custom-amount').value;
    console.log('Applying custom amount:', customAmount);
    
    // Update the offer amount on the page
    const offerAmount = document.querySelector('.offer-amount');
    if (offerAmount) {
        offerAmount.textContent = `$${parseInt(customAmount).toLocaleString()}`;
    }
    
    // Calculate and update fee
    const fee = 100000 - customAmount;
    const feeElement = document.querySelector('.detail-row.highlight span:last-child');
    if (feeElement) {
        feeElement.textContent = `$${fee.toLocaleString()}`;
    }
    
    closeCustomizeModal();
    console.log('Custom amount applied successfully');
}

// Terms Agreement Checkbox Handler
document.addEventListener('DOMContentLoaded', function() {
    console.log('DOM loaded, setting up event listeners');
    
    const agreeTerms = document.getElementById('agree-terms');
    const agreeRepayment = document.getElementById('agree-repayment');
    const getPaidBtn = document.getElementById('get-paid-btn');
    
    if (agreeTerms && agreeRepayment && getPaidBtn) {
        function checkAgreement() {
            const bothChecked = agreeTerms.checked && agreeRepayment.checked;
            getPaidBtn.disabled = !bothChecked;
            console.log('Agreement status:', bothChecked ? 'Both checked' : 'Not both checked');
        }
        
        agreeTerms.addEventListener('change', checkAgreement);
        agreeRepayment.addEventListener('change', checkAgreement);
        
        console.log('Terms agreement listeners set up');
    }
});

// Add smooth scrolling for better UX
document.addEventListener('DOMContentLoaded', function() {
    console.log('Setting up smooth scrolling');
    
    // Smooth scroll for anchor links
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
                console.log('Smooth scrolling to:', this.getAttribute('href'));
            }
        });
    });
});

// Add loading states for buttons
function addLoadingState(button) {
    console.log('Adding loading state to button');
    const originalText = button.innerHTML;
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
    button.disabled = true;
    
    return function() {
        console.log('Removing loading state from button');
        button.innerHTML = originalText;
        button.disabled = false;
    };
}

// Simulate API calls with loading states
function simulateApiCall(button, callback) {
    console.log('Simulating API call');
    const removeLoading = addLoadingState(button);
    
    setTimeout(() => {
        removeLoading();
        if (callback) callback();
        console.log('API call simulation completed');
    }, 2000);
}

// Enhanced button click handlers
document.addEventListener('DOMContentLoaded', function() {
    console.log('Setting up enhanced button handlers');
    
    // Add loading state to "See Your Offer" button
    const seeOfferBtn = document.querySelector('button[onclick="showPage(\'forecast-page\')"]');
    if (seeOfferBtn) {
        seeOfferBtn.addEventListener('click', function(e) {
            console.log('See Your Offer button clicked');
            simulateApiCall(this, () => {
                showPage('forecast-page');
            });
            e.preventDefault();
        });
    }
    
    // Add loading state to "Continue to Offer" button
    const continueBtn = document.querySelector('button[onclick="showPage(\'offer-page\')"]');
    if (continueBtn) {
        continueBtn.addEventListener('click', function(e) {
            console.log('Continue to Offer button clicked');
            simulateApiCall(this, () => {
                showPage('offer-page');
            });
            e.preventDefault();
        });
    }
    
    // Add loading state to "Accept Offer" button
    const acceptBtn = document.querySelector('button[onclick="showPage(\'terms-page\')"]');
    if (acceptBtn) {
        acceptBtn.addEventListener('click', function(e) {
            console.log('Accept Offer button clicked');
            simulateApiCall(this, () => {
                showPage('terms-page');
            });
            e.preventDefault();
        });
    }
    
    // Add loading state to "Get Paid Now" button
    const getPaidBtn = document.getElementById('get-paid-btn');
    if (getPaidBtn) {
        getPaidBtn.addEventListener('click', function(e) {
            console.log('Get Paid Now button clicked');
            simulateApiCall(this, () => {
                showPage('confirmation-page');
            });
            e.preventDefault();
        });
    }
});

// Add keyboard navigation support
document.addEventListener('keydown', function(e) {
    console.log('Key pressed:', e.key);
    
    // Escape key to close modals
    if (e.key === 'Escape') {
        const modal = document.querySelector('div[style*="position: fixed"]');
        if (modal) {
            closeCustomizeModal();
            console.log('Modal closed with Escape key');
        }
    }
    
    // Enter key to submit forms
    if (e.key === 'Enter') {
        const activeElement = document.activeElement;
        if (activeElement && activeElement.tagName === 'INPUT') {
            console.log('Enter key pressed on input, triggering form submission');
        }
    }
});

// Add form validation
function validateDateRange() {
    console.log('Validating date range');
    
    const dateRangeSlider = document.getElementById('date-range-slider');
    
    if (dateRangeSlider) {
        const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
        if (sliderInstance) {
            const startValue = sliderInstance.result.from;
            const endValue = sliderInstance.result.to;
            
            if (endValue <= startValue) {
                console.error('Invalid date range: end date must be after start date');
                alert('Please select a valid date range. End date must be after start date.');
                return false;
            }
            
            console.log('Date range validation passed');
            return true;
        }
    }
    
    return true;
}

// Add this to the forecast page continue button
document.addEventListener('DOMContentLoaded', function() {
    const continueBtn = document.querySelector('button[onclick="showPage(\'offer-page\')"]');
    if (continueBtn) {
        continueBtn.addEventListener('click', function(e) {
            if (!validateDateRange()) {
                e.preventDefault();
                return;
            }
        });
    }
});

// Test function to verify chart is working
function testChart() {
    console.log('Testing chart functionality...');
    console.log('Global orders:', globalOrders);
    console.log('Selected bars:', selectedBars);
    console.log('Chart data:', chartData);
    
    // Force chart redraw
    createSalesChart();
    
    // Test click on first bar
    if (chartData.barPositions && chartData.barPositions.length > 0) {
        console.log('Testing click on first bar...');
        selectedBars = [0];
        createSalesChart();
        updateAdvanceCalculation();
    }
}

// Make functions globally available
window.showPage = showPage;
window.toggleOrdersTable = toggleOrdersTable;
window.populateOrdersTable = populateOrdersTable;
window.changePage = changePage;
window.goToPage = goToPage;

// Toggle orders table visibility
function toggleOrdersTable(pageType = 'offer') {
    const tableContainer = document.getElementById(`orders-table-container${pageType === 'forecast' ? '-forecast' : ''}`);
    const showBtn = document.getElementById(`show-orders-btn${pageType === 'forecast' ? '-forecast' : ''}`);
    
    if (!tableContainer || !showBtn) {
        console.error('Table container or button not found for page:', pageType);
        return;
    }
    
    if (tableContainer.style.display === 'none') {
        // Show table and populate with data
        tableContainer.style.display = 'block';
        showBtn.innerHTML = '<i class="fas fa-eye-slash"></i> Hide Selected Orders';
        populateOrdersTable(pageType);
    } else {
        // Hide table
        tableContainer.style.display = 'none';
        showBtn.innerHTML = '<i class="fas fa-list"></i> Show Selected Orders';
    }
}

// Populate orders table with selected orders
function populateOrdersTable(pageType = 'offer', preservePagination = false) {
    const tableBody = document.getElementById(`orders-table-body${pageType === 'forecast' ? '-forecast' : ''}`);
    if (!tableBody) {
        console.error('Table body not found for page:', pageType);
        return;
    }
    
    // Get the current selected orders
    const dateRangeSlider = document.getElementById('date-range-slider');
    let startDate, endDate;
    
    if (dateRangeSlider) {
        const sliderInstance = $(dateRangeSlider).data('ionRangeSlider');
        if (sliderInstance) {
            startDate = getDateFromSliderValue(sliderInstance.result.from);
            endDate = getDateFromSliderValue(sliderInstance.result.to);
        }
    }
    
    let orderData;
    if (selectedBars.length > 0) {
        orderData = getOrdersForSelectedBars();
    } else {
        orderData = getOrdersForDateRange(startDate, endDate);
    }
    
    if (!orderData || !orderData.orders || orderData.orders.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 32px; color: #64748b;">No orders found for the selected criteria</td></tr>';
        hidePagination(pageType);
        return;
    }
    
    // Store all orders
    currentOrders = orderData.orders;
    totalOrders = currentOrders.length;
    
    // Only reset to first page if not preserving pagination
    if (!preservePagination) {
        currentPage = 1;
    }
    
    // Display current page
    displayOrdersPage(pageType);
    
    console.log(`Populated orders table with ${totalOrders} orders, showing page ${currentPage}`);
}

// Display orders for current page
function displayOrdersPage(pageType) {
    const tableBody = document.getElementById(`orders-table-body${pageType === 'forecast' ? '-forecast' : ''}`);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE;
    const endIndex = Math.min(startIndex + ORDERS_PER_PAGE, totalOrders);
    const pageOrders = currentOrders.slice(startIndex, endIndex);
    
    // Clear existing rows
    tableBody.innerHTML = '';
    
    // Add rows for current page orders
    pageOrders.forEach(order => {
        const row = document.createElement('tr');
        
        // Format dates
        const eventDate = new Date(order.date);
        const eventDateStr = eventDate.toLocaleDateString('en-US', { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Use must ship by date from CSV if available, otherwise calculate (7 days before event)
        let mustShipByStr;
        if (order.mustShipBy) {
            try {
                const mustShipByExcel = parseFloat(order.mustShipBy);
                if (!isNaN(mustShipByExcel)) {
                    const mustShipByDate = new Date((mustShipByExcel - 25569) * 86400 * 1000);
                    mustShipByStr = mustShipByDate.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric'
                    });
                } else {
                    // Fallback calculation
                    const mustShipBy = new Date(order.date);
                    mustShipBy.setDate(mustShipBy.getDate() - 7);
                    mustShipByStr = mustShipBy.toLocaleDateString('en-US', { 
                        year: 'numeric', 
                        month: 'short', 
                        day: 'numeric'
                    });
                }
            } catch (error) {
                // Fallback calculation
                const mustShipBy = new Date(order.date);
                mustShipBy.setDate(mustShipBy.getDate() - 7);
                mustShipByStr = mustShipBy.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric'
                });
            }
        } else {
            // Fallback calculation
            const mustShipBy = new Date(order.date);
            mustShipBy.setDate(mustShipBy.getDate() - 7);
            mustShipByStr = mustShipBy.toLocaleDateString('en-US', { 
                year: 'numeric', 
                month: 'short', 
                day: 'numeric'
            });
        }
        
        row.innerHTML = `
            <td>${order.transactionId}</td>
            <td>${order.eventId}</td>
            <td>${eventDateStr}</td>
            <td>${order.eventName}</td>
            <td>$${order.amount.toLocaleString()}</td>
            <td>${mustShipByStr}</td>
        `;
        
        tableBody.appendChild(row);
    });
    
    // Update pagination controls
    updatePagination(pageType);
}

// Update pagination controls
function updatePagination(pageType) {
    const totalPages = Math.ceil(totalOrders / ORDERS_PER_PAGE);
    const startIndex = (currentPage - 1) * ORDERS_PER_PAGE + 1;
    const endIndex = Math.min(startIndex + ORDERS_PER_PAGE - 1, totalOrders);
    
    // Update pagination info
    const paginationInfo = document.getElementById(`pagination-info${pageType === 'forecast' ? '-forecast' : ''}`);
    if (paginationInfo) {
        paginationInfo.textContent = `Showing ${startIndex}-${endIndex} of ${totalOrders} orders`;
    }
    
    // Show/hide pagination controls
    const paginationControls = document.getElementById(`pagination-controls${pageType === 'forecast' ? '-forecast' : ''}`);
    if (paginationControls) {
        paginationControls.style.display = totalPages > 1 ? 'block' : 'none';
    }
    
    // Update navigation buttons
    const prevBtn = document.getElementById(`prev-page${pageType === 'forecast' ? '-forecast' : ''}`);
    const nextBtn = document.getElementById(`next-page${pageType === 'forecast' ? '-forecast' : ''}`);
    
    if (prevBtn) prevBtn.disabled = currentPage <= 1;
    if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
    
    // Update page numbers
    updatePageNumbers(pageType, totalPages);
}

// Update page number buttons
function updatePageNumbers(pageType, totalPages) {
    const pageNumbersContainer = document.getElementById(`page-numbers${pageType === 'forecast' ? '-forecast' : ''}`);
    if (!pageNumbersContainer) return;
    
    pageNumbersContainer.innerHTML = '';
    
    // Show max 5 page numbers around current page
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    // Adjust start page if we're near the end
    if (endPage - startPage + 1 < maxVisiblePages) {
        startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    // Add first page if not visible
    if (startPage > 1) {
        addPageNumber(pageNumbersContainer, 1, pageType);
        if (startPage > 2) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-ellipsis';
            pageNumbersContainer.appendChild(ellipsis);
        }
    }
    
    // Add visible page numbers
    for (let i = startPage; i <= endPage; i++) {
        addPageNumber(pageNumbersContainer, i, pageType);
    }
    
    // Add last page if not visible
    if (endPage < totalPages) {
        if (endPage < totalPages - 1) {
            const ellipsis = document.createElement('span');
            ellipsis.textContent = '...';
            ellipsis.className = 'page-ellipsis';
            pageNumbersContainer.appendChild(ellipsis);
        }
        addPageNumber(pageNumbersContainer, totalPages, pageType);
    }
}

// Add page number button
function addPageNumber(container, pageNum, pageType) {
    const pageBtn = document.createElement('span');
    pageBtn.textContent = pageNum;
    pageBtn.className = `page-number ${pageNum === currentPage ? 'active' : ''}`;
    pageBtn.onclick = () => goToPage(pageType, pageNum);
    container.appendChild(pageBtn);
}

// Go to specific page
function goToPage(pageType, pageNum) {
    currentPage = pageNum;
    displayOrdersPage(pageType);
}

// Change page (next/previous)
function changePage(pageType, direction) {
    const newPage = currentPage + direction;
    if (newPage >= 1 && newPage <= Math.ceil(totalOrders / ORDERS_PER_PAGE)) {
        currentPage = newPage;
        displayOrdersPage(pageType);
    }
}

// Hide pagination controls
function hidePagination(pageType) {
    const paginationControls = document.getElementById(`pagination-controls${pageType === 'forecast' ? '-forecast' : ''}`);
    if (paginationControls) {
        paginationControls.style.display = 'none';
    }
}

// Gamified Achievement System Functions
let milestone200kCelebrated = false;
let milestone500kCelebrated = false;
let previousAdvanceAmount = 0;
let confettiInProgress = false;
let confettiCallCount = 0;

// Reset celebration flags when date range changes
function resetMilestoneCelebrations() {
    milestone200kCelebrated = false;
    milestone500kCelebrated = false;
    // Don't reset previousAdvanceAmount - we want to track it across slider movements
    confettiInProgress = false;
    confettiCallCount = 0;
}

function updateAchievementProgress(receivablesAmount, baseFees, ordersWithFees) {
    // Calculate the net receivables amount (receivables - base fee) for milestone checking
    const netReceivables = receivablesAmount - baseFees;
    
    // Calculate bonuses based on net receivables
    const bonus200k = netReceivables >= 200000 ? netReceivables * 0.005 : 0;
    const bonus500k = netReceivables >= 500000 ? netReceivables * 0.005 : 0;
    
    // Calculate final advance amount: receivables - base fees + bonuses
    const advanceAmount = receivablesAmount - baseFees + bonus200k + bonus500k;
    
    console.log('Updating achievement progress for net receivables:', netReceivables, 'previous:', previousAdvanceAmount);
    
    // Update 200k milestone (based on net receivables amount, not final advance)
    const achieved200k = updateMilestoneProgress('200k', netReceivables, 200000, '🏆', 'First Tier Bonus', 'Extra 0.5% payout bonus');
    
    // Update 500k milestone (based on net receivables amount, not final advance)
    const achieved500k = updateMilestoneProgress('500k', netReceivables, 500000, '💎', 'Elite Tier Bonus', 'Extra 1% total payout bonus');
    
    // Check for threshold crossings - ONLY when going UP and crossing the exact threshold
    // Also check that the net receivables amount has actually changed significantly
    const hasSignificantChange = Math.abs(netReceivables - previousAdvanceAmount) > 100;
    const crossed200kUpward = previousAdvanceAmount < 200000 && netReceivables >= 200000 && hasSignificantChange;
    const crossed500kUpward = previousAdvanceAmount < 500000 && netReceivables >= 500000 && hasSignificantChange;
    
    // Update previous amount immediately after threshold checks to prevent repeated confetti
    previousAdvanceAmount = netReceivables;
    
    console.log('Threshold check:', {
        previous: previousAdvanceAmount,
        current: netReceivables,
        hasSignificantChange: hasSignificantChange,
        crossed200k: crossed200kUpward,
        crossed500k: crossed500kUpward,
        milestone200kCelebrated: milestone200kCelebrated,
        milestone500kCelebrated: milestone500kCelebrated,
        confettiInProgress: confettiInProgress
    });
    
    // One-time confetti celebrations - only when crossing thresholds upward
    if (crossed200kUpward && !milestone200kCelebrated && !confettiInProgress) {
        confettiCallCount++;
        console.log('🎉 Crossing 200k advance amount threshold upward - triggering confetti! (Call #' + confettiCallCount + ')');
        confettiInProgress = true;
        showCelebrationEffect('200k', 'First Tier Bonus');
        milestone200kCelebrated = true;
        // Reset confetti flag after a delay
        setTimeout(() => { confettiInProgress = false; }, 3000);
    }
    
    if (crossed500kUpward && !milestone500kCelebrated && !confettiInProgress) {
        confettiCallCount++;
        console.log('🎉 Crossing 500k advance amount threshold upward - triggering confetti! (Call #' + confettiCallCount + ')');
        confettiInProgress = true;
        showCelebrationEffect('500k', 'Elite Tier Bonus');
        milestone500kCelebrated = true;
        // Reset confetti flag after a delay
        setTimeout(() => { confettiInProgress = false; }, 3000);
    }
}

function updateMilestoneProgress(milestoneId, currentAmount, targetAmount, icon, title, description) {
    const milestoneItem = document.getElementById(`milestone-${milestoneId}`);
    const progressFill = document.getElementById(`progress-${milestoneId}`);
    const progressText = document.getElementById(`progress-${milestoneId}-text`);
    
    if (!milestoneItem || !progressFill || !progressText) {
        console.warn(`Milestone elements not found for ${milestoneId}`);
        return false;
    }
    
    const progressPercentage = Math.min((currentAmount / targetAmount) * 100, 100);
    const isAchieved = currentAmount >= targetAmount;
    const isInProgress = currentAmount > 0 && !isAchieved;
    
    // Update progress bar with dynamic colors
    progressFill.style.width = `${progressPercentage}%`;
    progressText.textContent = `$${Math.min(currentAmount, targetAmount).toLocaleString()} / $${(targetAmount/1000).toFixed(0)}K`;
    
    // Apply dynamic colors and status based on progress
    if (isAchieved) {
        progressFill.style.background = 'linear-gradient(90deg, #10b981, #059669)'; // Green gradient
        milestoneItem.classList.add('unlocked');
        milestoneItem.classList.remove('locked', 'in-progress');
    } else if (isInProgress) {
        progressFill.style.background = 'linear-gradient(90deg, #f59e0b, #d97706)'; // Orange gradient
        milestoneItem.classList.add('in-progress');
        milestoneItem.classList.remove('locked', 'unlocked');
    } else {
        progressFill.style.background = 'linear-gradient(90deg, #6b7280, #4b5563)'; // Gray gradient
        milestoneItem.classList.add('locked');
        milestoneItem.classList.remove('achieved', 'in-progress');
    }
    
    return isAchieved;
}

function updateBreakdownDisplay(receivablesAmount, baseFees, bonus200k, bonus500k, totalFees, advanceAmount) {
    // Update base fee
    const baseFeeElement = document.getElementById('base-fee');
    if (baseFeeElement) {
        baseFeeElement.textContent = '$' + parseFloat(baseFees).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
    
    // Update 200k bonus
    const bonus200kRow = document.getElementById('bonus-200k-row');
    const bonus200kElement = document.getElementById('bonus-200k');
    if (bonus200kRow && bonus200kElement) {
        if (receivablesAmount >= 200000) {
            bonus200kRow.style.display = 'flex';
            bonus200kElement.textContent = '$' + parseFloat(bonus200k).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            bonus200kRow.style.display = 'none';
        }
    }
    
    // Update 500k bonus
    const bonus500kRow = document.getElementById('bonus-500k-row');
    const bonus500kElement = document.getElementById('bonus-500k');
    if (bonus500kRow && bonus500kElement) {
        if (receivablesAmount >= 500000) {
            bonus500kRow.style.display = 'flex';
            bonus500kElement.textContent = '$' + parseFloat(bonus500k).toLocaleString('en-US', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            });
        } else {
            bonus500kRow.style.display = 'none';
        }
    }
    
    // Update total fees
    const totalFeesElement = document.getElementById('total-fees');
    if (totalFeesElement) {
        totalFeesElement.textContent = '$' + parseFloat(totalFees).toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }
}

function showCelebrationEffect(milestoneId, title) {
    console.log(`Celebration effect for ${milestoneId}: ${title}`);
    
    // Create confetti effect
    createConfettiEffect();
    
    // Show notification
    showAchievementNotification(title, milestoneId);
}

function createConfettiEffect() {
    console.log('Creating confetti effect...');
    const confettiContainer = document.createElement('div');
    confettiContainer.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 9999;
    `;
    document.body.appendChild(confettiContainer);
    
    // Create confetti pieces
    for (let i = 0; i < 50; i++) {
        const confetti = document.createElement('div');
        confetti.style.cssText = `
            position: absolute;
            width: 10px;
            height: 10px;
            background: ${['#f59e0b', '#10b981', '#6366f1', '#8b5cf6'][Math.floor(Math.random() * 4)]};
            left: ${Math.random() * 100}%;
            top: -10px;
            animation: confettiFall ${2 + Math.random() * 3}s linear forwards;
            transform: rotate(${Math.random() * 360}deg);
        `;
        confettiContainer.appendChild(confetti);
    }
    
    // Add CSS animation
    if (!document.getElementById('confetti-styles')) {
        const style = document.createElement('style');
        style.id = 'confetti-styles';
        style.textContent = `
            @keyframes confettiFall {
                to {
                    transform: translateY(100vh) rotate(720deg);
                    opacity: 0;
                }
            }
        `;
        document.head.appendChild(style);
    }
    
    // Remove confetti after animation
    setTimeout(() => {
        confettiContainer.remove();
    }, 5000);
}

function showAchievementNotification(title, milestoneId) {
    const notification = document.createElement('div');
    notification.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #10b981 0%, #059669 100%);
        color: white;
        padding: 20px 30px;
        border-radius: 12px;
        box-shadow: 0 10px 30px rgba(16, 185, 129, 0.3);
        z-index: 10000;
        font-family: 'Inter', sans-serif;
        font-weight: 600;
        animation: slideInRight 0.5s ease-out;
        max-width: 300px;
    `;
    
    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
            <div style="font-size: 24px;">🎉</div>
            <div>
                <div style="font-size: 16px; margin-bottom: 4px;">Achievement Unlocked!</div>
                <div style="font-size: 14px; opacity: 0.9;">${title}</div>
            </div>
        </div>
    `;
    
    // Add CSS animation
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from { transform: translateX(100%); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
            }
        `;
        document.head.appendChild(style);
    }
    
    document.body.appendChild(notification);
    
    // Remove notification after 4 seconds
    setTimeout(() => {
        notification.style.animation = 'slideInRight 0.5s ease-out reverse';
        setTimeout(() => notification.remove(), 500);
    }, 4000);
}

console.log('EarlyPay application script loaded successfully');
console.log('Chart system simplified with full-width responsive design');
console.log('Features: Simple bar chart, accurate click highlighting, full screen width');
console.log('Added orders table functionality for selected orders display');
console.log('Added gamified achievement system with milestone tracking'); 