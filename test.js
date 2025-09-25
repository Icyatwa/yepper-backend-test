'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Card, CardDescription } from '@/components/ui/card';
import { Grid } from '@/components/ui/grid';
import { ArrowRight, ArrowLeft, Zap, Target, Check, TrendingUp, BarChart3, Globe, Clock } from 'lucide-react';
import { useAuth } from '@/contexts/auth-context';
import Link from 'next/link';

interface WebsiteSelection {
  websiteId?: {
    websiteName?: string;
    _id: string;
  };
  approved: boolean;
}

interface Ad {
  _id: string;
  businessName?: string;
  adDescription?: string;
  imageUrl?: string;
  videoUrl?: string;
  websiteSelections: WebsiteSelection[];
}

interface Website {
  _id: string;
  websiteName?: string;
  websiteLink?: string;
  imageUrl?: string;
  status: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, token, isAuthenticated } = useAuth();
  const [selectedFilter, setSelectedFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filteredAds, setFilteredAds] = useState<Ad[]>([]);
  const [filteredWebsites, setFilteredWebsites] = useState<Website[]>([]);
  const [showMarketing, setShowMarketing] = useState<boolean>(false);
  const [mixedAds, setMixedAds] = useState<Ad[]>([]);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [loading, setLoading] = useState(false);
  const marketingRef = useRef<HTMLDivElement>(null);

  const authenticatedAxios = axios.create({
    baseURL: 'http://localhost:5000/api',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  // Fetch ads data
  const fetchMixedAds = async () => {
    if (!user || !token || !isAuthenticated) return;
    
    try {
      setLoading(true);
      const userId = user._id || user.id;
      const response = await authenticatedAxios.get(`/web-advertise/mixed/${userId}`);
      setMixedAds(response.data || []);
    } catch (error) {
      console.error('Error fetching Ads:', error);
      setMixedAds([]);
    } finally {
      setLoading(false);
    }
  };

  // Fetch websites data
  const fetchWebsites = async () => {
    if (!user || !token || !isAuthenticated) return;
    
    try {
      setLoading(true);
      const userId = user._id || user.id;
      const response = await authenticatedAxios.get(`/createWebsite/${userId}`);
      setWebsites(response.data || []);
    } catch (error) {
      console.error('Error fetching websites:', error);
      setWebsites([]);
    } finally {
      setLoading(false);
    }
  };

  // Effect to fetch data when user is authenticated
  useEffect(() => {
    if (isAuthenticated && user && token) {
      fetchMixedAds();
      fetchWebsites();
    }
  }, [isAuthenticated, user, token]);

  useEffect(() => {
    if (!mixedAds) return;

    const performSearch = () => {
      const query = searchQuery.toLowerCase().trim();
      const statusFiltered = selectedFilter === 'all' 
        ? mixedAds 
        : mixedAds.filter(ad => ad.websiteSelections.some(ws => 
          selectedFilter === 'approved' ? ws.approved : !ws.approved
        ));

      if (!query) {
        setFilteredAds(statusFiltered);
        return;
      }

      const searched = statusFiltered.filter(ad => {
        const searchFields = [
          ad.businessName?.toLowerCase(),
          ad.adDescription?.toLowerCase(),
          ...ad.websiteSelections.map(ws => ws.websiteId?.websiteName?.toLowerCase())
        ];
        return searchFields.some(field => field?.includes(query));
      });
      
      setFilteredAds(searched);
    };

    performSearch();
  }, [searchQuery, selectedFilter, mixedAds]);

  useEffect(() => {
    if (!websites) return;

    const performSearch = () => {
      const query = searchQuery.toLowerCase().trim();
      const statusFiltered = selectedFilter === 'all' 
        ? websites 
        : websites.filter(website => website.status === selectedFilter);

      if (!query) {
        setFilteredWebsites(statusFiltered);
        return;
      }

      const searched = statusFiltered.filter(website => {
        const searchFields = [
          website.websiteName?.toLowerCase(),
          website.websiteLink?.toLowerCase(),
        ];
        return searchFields.some(field => field?.includes(query));
      });
        
      setFilteredWebsites(searched);
    };

    performSearch();
  }, [searchQuery, selectedFilter, websites]);

  useEffect(() => {
    if (isAuthenticated) return;

    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      const triggerPoint = window.innerHeight * 0.7;
      
      if (scrollPosition > triggerPoint && !showMarketing) {
        setShowMarketing(true);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isAuthenticated, showMarketing]);

  const handleReadMore = () => {
    setShowMarketing(true);
    setTimeout(() => {
      marketingRef.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }, 100);
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen p-4 bg-muted/30">
        <div className="min-h-screen flex items-center justify-center relative">
          <div className="max-w-4xl mx-auto flex items-start justify-center py-8">
            <Grid cols={2} gap={8} className="w-full">
              <div className="flex flex-col items-center space-y-6">
                <Button
                  className="h-16 w-full yepper-gradient text-white hover:opacity-90 flex items-center justify-center space-x-4 focus:outline-none focus:ring-0 min-h-[4rem]"
                  onClick={() => router.push('/onboarding/publisher')}
                >
                  <ArrowLeft />
                  <span className='text-center leading-tight'>Run Ads on your Website</span>
                </Button>
                <Card className="relative p-4 w-full">
                  <CardDescription className="text-lg">
                    Yepper helps web owners integrate advertising spaces directly into their sites. By adding your website here, you'll be able to manage ad spaces, choose where ads appear, and keep full control over how your site displays content. <button className='text-xl text-blue-500' onClick={handleReadMore}>Read More</button>
                  </CardDescription>
                </Card>
              </div>

              <div className="flex flex-col items-center space-y-6">
                <Button
                  className="h-16 w-full yepper-gradient text-white hover:opacity-90 flex items-center justify-center space-x-4 focus:outline-none focus:ring-0 min-h-[4rem]"
                  onClick={() => router.push('/onboarding/advertiser')}
                >
                  <span className='text-center leading-tight'>Advertise Your Product on Websites</span>
                  <ArrowRight />
                </Button>
                <Card className="relative p-4 w-full">
                  <CardDescription className="text-lg">
                    Yepper gives advertisers a simple way to connect with websites and display ads effectively. By adding your ad here, you'll be able to organize campaigns, select categories, and stay in control of how your ads appear. <button className='text-xl text-blue-500' onClick={handleReadMore}>Read More</button>
                  </CardDescription>
                </Card>
              </div>
            </Grid>
          </div>
        </div>
        
        <div 
          ref={marketingRef}
          className={`transition-all duration-1000 ease-out ${
            showMarketing 
              ? 'opacity-100 translate-y-0' 
              : 'opacity-0 translate-y-8 pointer-events-none'
          }`}
        >
          <div className="bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white py-20">
            <div className="max-w-6xl mx-auto px-6 text-center">
              <div className="inline-flex items-center px-4 py-2 bg-white/10 backdrop-blur-sm rounded-full text-sm font-medium mb-6">
                <Zap size={16} className="mr-2" />
                Next-Generation AdTech Platform
              </div>
              <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-blue-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
                The Future of Digital Advertising
              </h1>
              <p className="text-xl text-gray-300 max-w-3xl mx-auto leading-relaxed">
                Connect advertisers and publishers in a seamless ecosystem. Our AI-powered platform optimizes ad placements, maximizes revenue, and delivers exceptional user experiences across all digital touchpoints.
              </p>
            </div>
          </div>

          <div className="py-20 bg-gray-50">
            <div className="max-w-6xl mx-auto px-6">
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-gray-900 mb-4">
                  Why Choose Our Platform?
                </h2>
                <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                  Built for the modern web, our platform delivers results that matter to your business.
                </p>
              </div>

              <div className="grid md:grid-cols-3 gap-8">
                <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-blue-200">
                  <div className="w-14 h-14 bg-gradient-to-r from-blue-500 to-purple-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <Target size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Smart Targeting</h3>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    Reach your ideal customers with precision targeting based on demographics, interests, behavior, and real-time context.
                  </p>
                  <ul className="space-y-2 text-sm text-gray-500">
                    <li className="flex items-center">
                      <Check size={16} className="text-green-500 mr-2" />
                      Behavioral targeting
                    </li>
                    <li className="flex items-center">
                      <Check size={16} className="text-green-500 mr-2" />
                      Geo-location precision
                    </li>
                  </ul>
                </div>

                <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-green-200">
                  <div className="w-14 h-14 bg-gradient-to-r from-green-500 to-teal-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <TrendingUp size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Revenue Optimization</h3>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    Maximize your website's earning potential with intelligent ad placement and dynamic pricing.
                  </p>
                </div>

                <div className="group bg-white rounded-2xl p-8 shadow-lg hover:shadow-2xl transition-all duration-500 border border-gray-100 hover:border-purple-200">
                  <div className="w-14 h-14 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                    <BarChart3 size={28} className="text-white" />
                  </div>
                  <h3 className="text-2xl font-bold text-gray-900 mb-4">Advanced Analytics</h3>
                  <p className="text-gray-600 leading-relaxed mb-6">
                    Get deep insights into your ad performance with comprehensive analytics and reporting.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="py-20 bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white">
            <div className="max-w-4xl mx-auto px-6 text-center">
              <h2 className="text-4xl md:text-5xl font-bold mb-6">
                Ready to Get Started?
              </h2>
              <p className="text-xl text-gray-300 mb-10 max-w-2xl mx-auto">
                Join thousands of advertisers and publishers who trust our platform to grow their businesses.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button 
                  size="lg"
                  className="bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 px-8 py-4 text-lg font-semibold"
                  onClick={() => router.push('/onboarding/advertiser')}
                >
                  Start Advertising
                  <ArrowRight className="ml-2" size={20} />
                </Button>
                <Button 
                  size="lg"
                  className="bg-white/10 backdrop-blur-sm border border-white/20 hover:bg-white/20 px-8 py-4 text-lg font-semibold"
                  onClick={() => router.push('/onboarding/publisher')}
                >
                  <ArrowLeft className="mr-2" size={20} />
                  Monetize Website
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 bg-muted/30">
      <div className="min-h-screen flex items-center justify-center relative">
        <div className="max-w-4xl mx-auto flex items-start justify-center py-8">
          <Grid cols={2} gap={8} className="w-full">
            <div className="flex flex-col items-center space-y-6">
              <Button
                className="h-16 w-full yepper-gradient text-white hover:opacity-90 flex items-center justify-center space-x-4 focus:outline-none focus:ring-0 min-h-[4rem]"
                onClick={() => router.push('/onboarding/publisher')}
              >
                <ArrowLeft />
                <span className='text-center leading-tight'>Run Ads on your Website</span>
              </Button>
              
              <div className="w-80">
                {filteredWebsites && filteredWebsites.length > 0 ? (
                  <Link href="/websites">
                    <div className="relative cursor-pointer group">
                      <div className="relative bg-gradient-to-br from-green-50 via-white to-teal-50 border border-green-200/60 rounded-xl p-4 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(34,_197,_94,_0.15)] group-hover:border-green-300/80">
                        
                        <div className="relative h-32 overflow-hidden rounded-lg bg-gradient-to-br from-green-100/50 to-teal-100/30 border border-green-200/40 shadow-inner">
                          
                          {filteredWebsites.slice(0, 4).map((website, index) => {
                            const positions = [
                              { x: 12, y: 15, rotate: 0, scale: 1 },
                              { x: 52, y: 12, rotate: 5, scale: 0.9 },
                              { x: 15, y: 55, rotate: -3, scale: 0.95 },
                              { x: 55, y: 52, rotate: 8, scale: 0.85 }
                            ];
                            
                            const pos = positions[index];
                            
                            return (
                              <div
                                key={website._id}
                                className="absolute w-20 h-16 transition-all duration-700 group-hover:duration-500"
                                style={{
                                  left: `${pos.x}%`,
                                  top: `${pos.y}%`,
                                  transform: `rotate(${pos.rotate}deg) scale(${pos.scale})`,
                                  zIndex: 4 - index,
                                }}
                              >
                                <div className="relative bg-white rounded-md overflow-hidden shadow-lg border border-white/20 group-hover:shadow-xl transition-all duration-500 hover:scale-110">
                                  <div className="h-1.5 bg-gradient-to-r from-green-500 to-emerald-500 flex items-center px-1">
                                    <div className="w-0.5 h-0.5 bg-white/60 rounded-full"></div>
                                  </div>
                                  
                                  <div className="p-1.5 h-full flex flex-col">
                                    <div className="w-full h-6 overflow-hidden rounded-sm mb-1.5 bg-gradient-to-br from-slate-100 to-slate-200 relative">
                                      {website.imageUrl ? (
                                        <img 
                                          src={website.imageUrl} 
                                          alt={website.websiteName}
                                          className="w-full h-full object-cover"
                                        />
                                      ) : (
                                        <div className="w-full h-full flex items-center justify-center">
                                          <Globe size={12} className="text-slate-400" />
                                        </div>
                                      )}
                                    </div>
                                    
                                    <div className="flex-1 flex flex-col justify-center">
                                      <div className="text-[8px] font-semibold text-gray-700 text-center leading-tight truncate px-0.5">
                                        {website.websiteName || 'Unnamed Website'}
                                      </div>
                                      <div className="h-0.5 bg-slate-300 rounded-full w-3/4 mx-auto mt-0.5"></div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                          
                          {filteredWebsites.length > 4 && (
                            <div className="absolute bottom-1 right-1 w-5 h-3 bg-white/90 backdrop-blur-sm rounded border border-green-200/60 flex items-center justify-center shadow-sm">
                              <span className="text-[7px] font-bold text-green-600">+{filteredWebsites.length - 4}</span>
                            </div>
                          )}
                        </div>
                        
                        <div className="relative mt-3 flex items-center justify-center">
                          <div className="flex items-center space-x-1 bg-gradient-to-r from-green-50 to-teal-50 rounded-full px-3 py-1.5 border border-green-100/50">
                            <span className="text-xs font-semibold bg-gradient-to-r from-green-600 to-teal-600 bg-clip-text text-transparent">
                              Websites
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </Link>
                ) : (
                  <div className="text-center py-8">
                    <div className="inline-flex items-center justify-center w-12 h-12 bg-green-100 rounded-full mb-3">
                      <Globe size={24} className="text-green-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-800 mb-1">
                      {searchQuery ? 'No Websites Found' : 'No Websites Yet'}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {searchQuery 
                        ? 'No websites match your search criteria.'
                        : 'Start adding your first website.'
                      }
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col items-center space-y-6">
              <Button
                className="h-16 w-full yepper-gradient text-white hover:opacity-90 flex items-center justify-center space-x-4 focus:outline-none focus:ring-0 min-h-[4rem]"
                onClick={() => router.push('/onboarding/advertiser')}
              >
                <span className='text-center leading-tight'>Advertise Your Product on Websites</span>
                <ArrowRight />
              </Button>

              <div className="w-80">
                {filteredAds && filteredAds.length > 0 ? (
                  <Link href="/ads">
                    <div className="relative cursor-pointer group">
                      <div className="relative bg-gradient-to-br from-slate-50 via-white to-slate-100 border border-slate-200/60 rounded-xl p-4 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(8,_112,_184,_0.15)] group-hover:border-blue-200/80">
                        
                        <div className="relative h-24 overflow-hidden rounded-lg bg-gradient-to-br from-slate-100/50 to-slate-200/30 border border-slate-200/40 shadow-inner">
                          
                          {filteredAds.slice(0, 4).map((ad, index) => {
                            const positions = [
                              { x: 15, y: 10, rotate: -8, scale: 1 },
                              { x: 45, y: 25, rotate: 12, scale: 0.95 },
                              { x: 25, y: 45, rotate: -15, scale: 0.9 },
                              { x: 60, y: 15, rotate: 6, scale: 0.85 }
                            ];
                            
                            const pos = positions[index];
                            
                             return (
                                                          <div
                                                            key={ad._id}
                                                            className="absolute w-16 h-12 transition-all duration-700 group-hover:duration-500"
                                                            style={{
                                                              left: `${pos.x}%`,
                                                              top: `${pos.y}%`,
                                                              transform: `rotate(${pos.rotate}deg) scale(${pos.scale})`,
                                                              zIndex: 4 - index,
                                                            }}
                                                          >
                                                            <div className="relative bg-white rounded-lg overflow-hidden shadow-lg border border-white/20 group-hover:shadow-xl transition-all duration-500 hover:scale-105 hover:rotate-0">
                                                              <div className="h-1.5 bg-gradient-to-r from-blue-500 to-blue-600"></div>
                                                              
                                                              <div className="p-1 h-full flex flex-col">
                                                                <div className="w-full h-4 overflow-hidden rounded mb-1 bg-slate-100">
                                                                  {ad.videoUrl ? (
                                                                    <video 
                                                                      muted 
                                                                      className="w-full h-full object-cover"
                                                                    >
                                                                      <source src={ad.videoUrl} type="video/mp4" />
                                                                    </video>
                                                                  ) : (
                                                                    <img 
                                                                      src={ad.imageUrl} 
                                                                      alt={ad.businessName}
                                                                      className="w-full h-full object-cover"
                                                                    />
                                                                  )}
                                                                </div>
                                                                
                                                                <div className="flex-1 space-y-0.5">
                                                                  <div className="h-1 bg-slate-200 rounded-full w-3/4"></div>
                                                                  <div className="h-0.5 bg-slate-100 rounded-full w-1/2"></div>
                                                                </div>
                                                                
                                                                <div className="flex items-center justify-between mt-0.5">
                                                                  <div className="w-1 h-1 rounded-full bg-gradient-to-r from-blue-500 to-blue-600"></div>
                                                                  <div className="text-[6px] text-slate-400 font-medium">
                                                                    {ad.websiteSelections?.length || 0}
                                                                  </div>
                                                                </div>
                                                              </div>
                                                            </div>
                                                          </div>
                                                        );
                                                      })}
                                                      
                                                      {filteredAds.length > 4 && (
                                                        <div className="absolute bottom-2 right-2 w-6 h-4 bg-white/80 backdrop-blur-sm rounded border border-slate-200/60 flex items-center justify-center shadow-sm">
                                                          <span className="text-[8px] font-bold text-slate-600">+{filteredAds.length - 4}</span>
                                                        </div>
                                                      )}
                                                    </div>
                                                    
                                                    <div className="relative mt-3 flex items-center justify-center">
                                                      <div className="flex items-center space-x-1 bg-gradient-to-r from-blue-50 to-purple-50 rounded-full px-3 py-1.5 border border-blue-100/50">
                                                        <span className="text-xs font-semibold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                                          Your Ads
                                                        </span>
                                                      </div>
                                                    </div>
                                                  </div>
                                                </div>
                                              </Link>
                                            ) : (
                                              <div className="text-center py-8">
                                                <div className="inline-flex items-center justify-center w-12 h-12 bg-gray-100 rounded-full mb-3">
                                                  <Clock size={24} className="text-gray-400" />
                                                </div>
                                                <h3 className="text-lg font-medium text-gray-800 mb-1">
                                                  {searchQuery ? 'No Campaigns Found' : 'No Active Campaigns Yet'}
                                                </h3>
                                                <p className="text-sm text-gray-600">
                                                  {searchQuery 
                                                    ? 'No campaigns match your current search criteria.'
                                                    : 'Start creating your first campaign.'
                                                  }
                                                </p>
                                              </div>
                                            )}
                                          </div>
                                        </div>
                                      </Grid>
                                    </div>
                                  </div>
                                </div>
                              );
                            }